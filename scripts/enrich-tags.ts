/**
 * Re-tags gifts per product instead of per source.
 *
 * Taxonomy currently comes from the import manifests, so it describes the
 * *query* a product arrived through rather than the product itself. Every
 * Shopify brand therefore carries exactly one interest set and one age range
 * across its whole catalogue — all 93 Cuyana items identical, all 70 Snif —
 * and 9,866 gifts share only 130 distinct interest combinations between them.
 *
 * That is the ranking's real weakness. With brand-level tags, interestScore
 * and ageScore return the same value for every product from a brand, leaving
 * price as the only thing that varies — which is exactly why selectDiverse had
 * to exist. This pass fixes the cause; the diversity penalty then only has to
 * handle genuine near-duplicates.
 *
 * Occasions are deliberately left alone. An occasion says why someone is
 * shopping, not what the product is, so it belongs to the curated query that
 * found it. Only the product-intrinsic fields are re-derived here.
 *
 * Uses the Batch API: thousands of independent, non-latency-sensitive calls at
 * half the standard rate. Nothing here runs at request time — /api/recommend
 * stays a plain Postgres query.
 *
 * Usage:
 *   npm run enrich:tags -- --dry-run --limit 25   inspect proposed tags
 *   npm run enrich:tags -- --limit 100            write 100, to spot-check
 *   npm run enrich:tags                           re-tag everything
 *
 *   --platform "Snif"   restrict to one source
 */

// tsx does not read .env on its own. Same pattern as prisma.config.ts.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { INTERESTS } from "../lib/gift-options";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const LIMIT = Number(argValue("--limit") ?? 0) || undefined;
const PLATFORM = argValue("--platform");

const MODEL = "claude-opus-5";
/** Batches cap at 100k requests; chunk anyway so a failure costs one chunk. */
const CHUNK_SIZE = 2000;
const POLL_INTERVAL_MS = 20_000;

/** Descriptions run to ~400 chars; more than this is marketing, not signal. */
const MAX_DESCRIPTION_CHARS = 500;

const SYSTEM_PROMPT = `You tag gift products for a gift-recommendation catalogue.

Given a product's name and description, decide:

- interests: which of the catalogue's interest categories the product genuinely
  serves. Pick 1-4. Choose only categories a shopper looking for this exact
  product would have selected — not everything vaguely adjacent. A scented
  candle is Home Decor and Self-care; it is not Creativity because it is
  hand-poured.
- ageMin / ageMax: the age range the product actually suits, as whole years
  between 1 and 99. Be specific where the product is specific: a wooden stacking
  toy is roughly 1-4, not 1-99. Use a wide range only for genuinely universal
  products.
- gender: "male" or "female" only when the product is clearly marketed to one.
  Everything else is "unisex". Default to "unisex" when uncertain — a wrong
  gender tag hides the product from half the people who would want it.

Judge the product in front of you, not the brand it came from.`;

const TAG_SCHEMA = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      interests: {
        type: "array",
        // Enumerating the taxonomy makes an invalid value structurally
        // impossible, rather than something to catch after the fact.
        items: { type: "string", enum: [...INTERESTS] },
      },
      ageMin: { type: "integer" },
      ageMax: { type: "integer" },
      gender: { type: "string", enum: ["male", "female", "unisex"] },
    },
    required: ["interests", "ageMin", "ageMax", "gender"],
    additionalProperties: false,
  },
};

interface ProposedTags {
  interests: string[];
  ageMin: number;
  ageMax: number;
  gender: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate by code point, then drop any unpaired surrogate.
 *
 * Slicing by UTF-16 code unit splits an emoji's surrogate pair in half, and a
 * lone surrogate cannot be encoded as JSON — the API rejects the whole batch
 * with "no low surrogate in string", naming a character offset in a 5MB body
 * rather than the product that caused it. The same guard exists as
 * `truncateText` in import-bestbuy.ts.
 *
 * The second pass matters independently of the first: scraped listing text can
 * arrive already containing an unpaired surrogate, so trimming on a code-point
 * boundary alone is not enough.
 */
function cleanText(text: string, maxLength: number): string {
  const codePoints = [...text];
  const truncated =
    codePoints.length <= maxLength ? text : codePoints.slice(0, maxLength).join("");
  return truncated.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}

/**
 * The model can still return a range that is inverted or out of bounds — the
 * schema constrains the type, not the values (numeric bounds aren't supported
 * in structured-output schemas). Reject rather than write nonsense.
 */
function isUsable(tags: ProposedTags): boolean {
  if (tags.interests.length === 0) return false;
  if (!Number.isInteger(tags.ageMin) || !Number.isInteger(tags.ageMax)) return false;
  if (tags.ageMin < 1 || tags.ageMax > 99) return false;
  if (tags.ageMin > tags.ageMax) return false;
  return true;
}

async function main() {
  if (!API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Add it to .env (not .env.example, which is committed):\n" +
        '  ANTHROPIC_API_KEY="sk-ant-..."\n' +
        "Create one at https://console.anthropic.com -> API Keys, and add a billing\n" +
        "balance — the API is prepaid and separate from any Claude subscription.",
    );
    process.exitCode = 1;
    return;
  }

  const anthropic = new Anthropic({ apiKey: API_KEY });
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const gifts = await prisma.gift.findMany({
      where: PLATFORM ? { platform: PLATFORM } : undefined,
      select: {
        id: true,
        name: true,
        description: true,
        platform: true,
        interests: true,
        ageMin: true,
        ageMax: true,
        gender: true,
      },
      orderBy: { id: "asc" },
      take: LIMIT,
    });

    if (gifts.length === 0) {
      console.log("No gifts matched.");
      return;
    }

    console.log(`Tagging ${gifts.length} gift(s) with ${MODEL} via the Batch API.\n`);

    const byId = new Map(gifts.map((gift) => [gift.id, gift]));
    const proposals = new Map<string, ProposedTags>();
    const failures: Record<string, number> = {};
    let written = 0;

    for (let start = 0; start < gifts.length; start += CHUNK_SIZE) {
      const chunk = gifts.slice(start, start + CHUNK_SIZE);
      const chunkLabel = `chunk ${Math.floor(start / CHUNK_SIZE) + 1}`;
      const chunkProposals = new Map<string, ProposedTags>();

      const batch = await anthropic.messages.batches.create({
        requests: chunk.map((gift) => ({
          custom_id: gift.id,
          params: {
            model: MODEL,
            // Thinking is on by default on this model and shares the budget
            // with the response, so leave headroom even though the JSON is tiny.
            max_tokens: 2048,
            // A tagging call is a classification, not a reasoning problem.
            output_config: { effort: "low" as const, format: TAG_SCHEMA },
            system: [
              {
                type: "text" as const,
                text: SYSTEM_PROMPT,
                // Identical across every request in the run.
                cache_control: { type: "ephemeral" as const },
              },
            ],
            messages: [
              {
                role: "user" as const,
                content:
                  `Sold by: ${gift.platform}\n` +
                  `Name: ${cleanText(gift.name, 200)}\n` +
                  `Description: ${cleanText(gift.description, MAX_DESCRIPTION_CHARS)}`,
              },
            ],
          },
        })),
      });

      process.stdout.write(`  ${chunkLabel}: submitted ${batch.id} `);

      let status = batch;
      while (status.processing_status !== "ended") {
        await sleep(POLL_INTERVAL_MS);
        status = await anthropic.messages.batches.retrieve(batch.id);
        process.stdout.write(".");
      }
      console.log(` done (${status.request_counts.succeeded} ok, ${status.request_counts.errored} errored)`);

      for await (const entry of await anthropic.messages.batches.results(batch.id)) {
        if (entry.result.type !== "succeeded") {
          failures[entry.result.type] = (failures[entry.result.type] ?? 0) + 1;
          continue;
        }

        const block = entry.result.message.content.find((b) => b.type === "text");
        if (!block || block.type !== "text") {
          failures["no text block"] = (failures["no text block"] ?? 0) + 1;
          continue;
        }

        let parsed: ProposedTags;
        try {
          parsed = JSON.parse(block.text) as ProposedTags;
        } catch {
          failures["unparseable json"] = (failures["unparseable json"] ?? 0) + 1;
          continue;
        }

        if (!isUsable(parsed)) {
          failures["failed validation"] = (failures["failed validation"] ?? 0) + 1;
          continue;
        }

        proposals.set(entry.custom_id, parsed);
        chunkProposals.set(entry.custom_id, parsed);
      }

      // Persist per chunk rather than after the whole run. A failure while
      // submitting a later chunk would otherwise discard every result already
      // paid for — which is exactly what happened the first time this ran.
      if (!DRY_RUN && chunkProposals.size > 0) {
        for (const [id, tags] of chunkProposals) {
          await prisma.gift.update({
            where: { id },
            data: {
              interests: tags.interests,
              ageMin: tags.ageMin,
              ageMax: tags.ageMax,
              gender: tags.gender,
            },
          });
        }
        written += chunkProposals.size;
        console.log(`  ${chunkLabel}: wrote ${chunkProposals.size} (${written} total)`);
      }
    }

    console.log(`\nUsable proposals: ${proposals.size} of ${gifts.length}.`);
    if (Object.keys(failures).length > 0) {
      console.log("Skipped:");
      for (const [reason, count] of Object.entries(failures)) {
        console.log(`  ${count} × ${reason}`);
      }
    }

    // How much finer the new tagging is — the number this pass exists to move.
    const before = new Set(gifts.map((g) => [...g.interests].sort().join("|")));
    const after = new Set([...proposals.values()].map((t) => [...t.interests].sort().join("|")));
    console.log(
      `\nDistinct interest combinations: ${before.size} before → ${after.size} after.`,
    );

    if (DRY_RUN) {
      console.log("\n--dry-run: nothing written. Sample:\n");
      for (const [id, tags] of [...proposals.entries()].slice(0, 15)) {
        const gift = byId.get(id)!;
        console.log(`  ${gift.name.slice(0, 58)}`);
        console.log(`    was  ${gift.interests.join(", ")}  ·  ${gift.ageMin}-${gift.ageMax}  ·  ${gift.gender}`);
        console.log(`    now  ${tags.interests.join(", ")}  ·  ${tags.ageMin}-${tags.ageMax}  ·  ${tags.gender}\n`);
      }
      return;
    }

    // Writes already happened per chunk above.
    console.log(`\nUpdated ${written} gift(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
