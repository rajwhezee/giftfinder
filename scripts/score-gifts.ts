/**
 * Scores every gift 0-100 on how well it reads as something a person would
 * enjoy unwrapping, as opposed to a useful purchase.
 *
 * This is the one judgement the keyword rules in lib/product-tags.ts cannot
 * make. They can tell a candle from a keyboard; they cannot tell a $3 pack of
 * decoupage napkins from a $27 stained-glass suncatcher, because the
 * difference is not a category — both are craft-adjacent home items, and only
 * one of them is a gift. A gift site that cannot draw that line puts craft
 * supplies and refill packs in front of someone shopping for a birthday.
 *
 * Offline, like scripts/enrich-tags.ts, and for the same reason: the request
 * path stays a Postgres query plus pure scoring.
 *
 * Usage:
 *   npm run score:gifts -- --dry-run --limit 100    inspect, write nothing
 *   npm run score:gifts -- --limit 1000             a pilot slice
 *   npm run score:gifts -- --only-missing           everything unscored
 */

// tsx does not read .env on its own. Same pattern as prisma.config.ts.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_MISSING = process.argv.includes("--only-missing");

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}
const LIMIT = Number(argValue("--limit") ?? 0) || undefined;
const PLATFORM = argValue("--platform");

/**
 * Haiku rather than Opus, and deliberately so: this is classification against
 * fixed anchors, not a reasoning problem, and the whole catalogue costs $1.66
 * here against $8.28 on Opus 5.
 */
const MODEL = "claude-haiku-4-5";

/**
 * Products per request. The system prompt is the same for every product, so
 * sending them one at a time re-bills it 18,929 times: measured at 330 input
 * tokens per product alone, and 102 at twenty to a request. Higher would save
 * a little more and makes a mis-parse cost more, since a chunk is all-or-
 * nothing.
 */
const PER_REQUEST = 20;
/** Requests per batch. Chunked so a failure costs one batch, not the run. */
const REQUESTS_PER_BATCH = 100;
const POLL_INTERVAL_MS = 20_000;

/** Descriptions past this are marketing, and they are most of the token bill. */
const MAX_DESCRIPTION_CHARS = 180;

/** Below this a gift is demoted in ranking; see GIFT_SCORE_FLOOR there. */
const LOW = 20;

/**
 * Occasions whose defining gift is often a plain, cheap, ritual object.
 *
 * The model reliably misreads these. A rakhi thread scored 8 even after the
 * prompt named rakhi explicitly, and a set of Lunar New Year red envelopes
 * scored 5 — it anchors on "$4, thread" and sees materials. But a rakhi *is*
 * the gift at Raksha Bandhan, and this site sells itself on "any occasion, any
 * culture" and ships a landing page for each of these. Demoting the tradition
 * on its own occasion page is the worst thing this score could do.
 */
const CULTURAL_OCCASIONS = new Set([
  "Diwali", "Holi", "Raksha Bandhan", "Eid al-Fitr", "Eid al-Adha", "Hanukkah",
  "Passover", "Lunar New Year", "Mid-Autumn Festival", "Nowruz", "Vaisakhi",
  "Onam", "Quinceañera", "Day of the Dead", "Kwanzaa", "St. Patrick's Day",
  "Vesak", "Bar/Bat Mitzvah", "Carnival", "Oktoberfest",
]);

/**
 * Things sold to people *making* or *wrapping* a gift. The rescue above must
 * not reach these: mooncake packaging boxes carry the Mid-Autumn tag too, and
 * a box is not a gift in any culture.
 */
const SUPPLY = /\bbox(es)?\b|\bpackaging\b|\blabels?\b|\bstickers?\b|\bmould?s?\b|\bblanks?\b|\brefills?\b|\bfindings\b|\bwholesale\b|\bbulk\b|\bsupplies\b|\btemplate\b|\bcutter\b|\benvelopes?\b/i;

const SYSTEM_PROMPT = `Rate how well each product works as a GIFT — something a
person would be pleased to unwrap from someone else. This is not product
quality and it is not value for money. A well-made thing can be a poor gift.

80-100  an obvious, delightful gift: giftable as it stands, feels considered
50-79   works as a gift for the right recipient
20-49   useful but dull to receive; a purchase rather than a present
0-19    not a gift at all: refills, replacement parts, samples, testers,
        multipacks of consumables, craft supplies and raw materials,
        accessories useless without the thing they attach to, gift cards

Judge the product, not the price. A $4 enamel pin can be a real gift; a $200
set of replacement filters cannot.

Two things that look like the bottom band and are not:

- Ritual and ceremonial items ARE the gift for their occasion, however plain or
  cheap they look. A rakhi thread for Raksha Bandhan, mooncakes for Mid-Autumn,
  an advent candle, a Diwali diya: these are the tradition, not an accessory to
  it. Score them as the gifts they are.
- A kit or set sold as an activity is a gift — candle making, pottery, baking.
  Raw materials, blanks and findings sold to someone making something to sell
  are not.

Reply with a JSON array, one object per numbered item, in the same order, with
no other text: [{"i":1,"score":72},{"i":2,"score":15}]`;

interface Scored {
  id: string;
  name: string;
  platform: string;
  price: number;
  score: number;
}

/**
 * Collapses whitespace, truncates on a code-point boundary, then strips any
 * unpaired surrogate.
 *
 * The last step is not defensive programming, it is the difference between a
 * run and a 400. Half an emoji in one product title makes the whole batch body
 * invalid JSON, and the API reports it as a character offset into a multi-
 * megabyte payload rather than naming the product. Same guard as `cleanText`
 * in enrich-tags.ts and `truncateText` in import-bestbuy.ts — scraped listing
 * text arrives with these already in it, so truncating on a boundary alone is
 * not enough.
 */
function cleanText(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const codePoints = [...collapsed];
  const truncated =
    codePoints.length <= max ? collapsed : codePoints.slice(0, max).join("");
  return truncated.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Pulls the scores out of one reply.
 *
 * Returns null unless there is exactly one score per product sent. A short or
 * long array cannot be trusted to line up — position is the only thing tying a
 * score to a product, so a missing entry would silently shift every score after
 * it onto the wrong row. Rejecting the chunk costs one retry; accepting a
 * shifted chunk corrupts twenty rows and looks like nothing at all.
 */
function parseScores(text: string, expected: number): number[] | null {
  const entries = [...text.matchAll(/"i"\s*:\s*(\d+)\s*,\s*"score"\s*:\s*(\d+)/g)];
  if (entries.length !== expected) return null;

  const scores = new Array<number>(expected).fill(-1);
  for (const entry of entries) {
    const index = Number(entry[1]) - 1;
    if (index < 0 || index >= expected) return null;
    scores[index] = Math.max(0, Math.min(100, Number(entry[2])));
  }
  return scores.every((s) => s >= 0) ? scores : null;
}

async function main() {
  if (!API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY missing. Add it to .env (not .env.example, which is committed).",
    );
    process.exitCode = 1;
    return;
  }

  const anthropic = new Anthropic({ apiKey: API_KEY });
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const gifts = await prisma.gift.findMany({
      where: {
        ...(PLATFORM ? { platform: PLATFORM } : {}),
        ...(ONLY_MISSING ? { giftScore: null } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        platform: true,
        price: true,
        occasions: true,
      },
      orderBy: { id: "asc" },
      take: LIMIT,
    });

    if (gifts.length === 0) {
      console.log("No gifts matched.");
      return;
    }

    const groups = chunk(gifts, PER_REQUEST);
    console.log(
      `Scoring ${gifts.length} gift(s) with ${MODEL} via the Batch API, ` +
        `${PER_REQUEST} per request (${groups.length} requests).\n`,
    );

    const scored: Scored[] = [];
    let rejected = 0;
    let rescued = 0;

    for (const [batchIndex, batchGroups] of chunk(groups, REQUESTS_PER_BATCH).entries()) {
      const batch = await anthropic.messages.batches.create({
        requests: batchGroups.map((group, i) => ({
          custom_id: `g${batchIndex}_${i}`,
          params: {
            model: MODEL,
            max_tokens: 16 * PER_REQUEST + 200,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: "user" as const,
                content: group
                  .map(
                    (gift, n) =>
                      `${n + 1}. ${cleanText(gift.name, 110)} | ${gift.platform} | ` +
                      `$${Number(gift.price).toFixed(0)} | ` +
                      cleanText(gift.description ?? "", MAX_DESCRIPTION_CHARS),
                  )
                  .join("\n"),
              },
            ],
          },
        })),
      });

      process.stdout.write(`  batch ${batchIndex + 1}: ${batch.id} `);

      let status = batch;
      while (status.processing_status !== "ended") {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        status = await anthropic.messages.batches.retrieve(batch.id);
        process.stdout.write(".");
      }
      process.stdout.write("\n");

      for await (const entry of await anthropic.messages.batches.results(batch.id)) {
        if (entry.result.type !== "succeeded") {
          rejected += PER_REQUEST;
          continue;
        }
        const [, groupIndex] = entry.custom_id.split("_");
        const group = batchGroups[Number(groupIndex)];
        const block = entry.result.message.content.find((b) => b.type === "text");
        const text = block && "text" in block ? block.text : "";

        const scores = parseScores(text, group.length);
        if (!scores) {
          rejected += group.length;
          continue;
        }
        group.forEach((gift, i) => {
          let score = scores[i];
          // Rescue the ritual object, never the packaging around it.
          if (
            score < LOW &&
            gift.occasions.some((o) => CULTURAL_OCCASIONS.has(o)) &&
            !SUPPLY.test(gift.name)
          ) {
            rescued++;
            score = LOW;
          }
          scored.push({
            id: gift.id,
            name: gift.name,
            platform: gift.platform,
            price: Number(gift.price),
            score,
          });
        });
      }
    }

    const buckets = [0, 20, 40, 60, 80].map((low) => ({
      low,
      n: scored.filter((s) => s.score >= low && s.score < low + 20).length,
    }));
    console.log(
      `\nScored ${scored.length}` +
        (rejected ? `, rejected ${rejected}` : "") +
        (rescued ? `, ${rescued} cultural item(s) lifted off the floor` : "") +
        ".",
    );
    console.log("distribution:");
    for (const b of buckets) {
      const bar = "█".repeat(Math.round((b.n / Math.max(scored.length, 1)) * 40));
      console.log(`  ${String(b.low).padStart(3)}-${String(b.low + 19).padEnd(3)} ${String(b.n).padStart(5)}  ${bar}`);
    }

    const low = scored.filter((s) => s.score < LOW).sort((a, b) => a.score - b.score);
    console.log(`\nbelow ${LOW} (${low.length}, these get demoted) — lowest 12:`);
    for (const s of low.slice(0, 12)) {
      console.log(`  ${String(s.score).padStart(3)}  $${s.price.toFixed(0).padStart(4)}  ${s.platform.padEnd(16)} ${s.name.slice(0, 50)}`);
    }
    console.log("\nhighest 6:");
    for (const s of [...scored].sort((a, b) => b.score - a.score).slice(0, 6)) {
      console.log(`  ${String(s.score).padStart(3)}  $${s.price.toFixed(0).padStart(4)}  ${s.platform.padEnd(16)} ${s.name.slice(0, 50)}`);
    }

    if (DRY_RUN) {
      console.log("\n--dry-run: nothing written.");
      return;
    }

    let written = 0;
    for (const s of scored) {
      await prisma.gift.update({ where: { id: s.id }, data: { giftScore: s.score } });
      written++;
    }
    console.log(`\nWrote ${written} score(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
