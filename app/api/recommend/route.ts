import { NextResponse } from "next/server";
import { BUDGET_UNCAPPED_AT, JUST_BECAUSE } from "@/lib/gift-options";
import { prisma } from "@/lib/prisma";
import { looksNonEnglish } from "@/lib/language";
import { namesADifferentOccasion, occasionGiftFit, tooCrudeForOccasion } from "@/lib/occasion-fit";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { parseRecommendBody } from "@/lib/recommend-request";
import { MIN_INTEREST_MATCHES, scoreGift, selectDiverse } from "@/lib/ranking";
import type { GiftRecommendation } from "@/lib/types";

/**
 * The hard ceiling on a page. A guard on payload and CPU, not an answer.
 *
 * At 72 the cap was below the eligible count for almost every combination, so
 * every search returned exactly 72 results, and raising it to 150 only moved
 * where that happened: broad queries still saturated it, so the page kept
 * announcing the same number whoever it was for. What decides the real length
 * is QUALITY_RATIO below; this only stops an unusually flat query from
 * shipping thousands of rows.
 *
 * The UI reveals these progressively as the shopper scrolls, so a larger array
 * costs payload rather than render time.
 */
const MAX_RESULTS = 150;

/**
 * How far below the best match a gift may score and still make the page.
 *
 * A page is only as good as its worst row, and a fixed slot count guarantees
 * the tail gets filled whether or not anything down there deserved a slot.
 * This cuts on fit instead: keep what scores within 12% of the strongest
 * match, and let the length fall out of how much genuinely matched.
 *
 * 0.88, measured against production on 2026-09-01 over the eligible set of six
 * representative quizzes (count kept at each ratio):
 *
 *              friend  christmas  cooking  child  coworker  graduation
 *   eligible     1868      12714      270     70      1149        2950
 *   0.92            4         22       84     20       125           4
 *   0.90           90         39      101     32       157           4
 *   0.88          119         59      114     43       242          42
 *   0.86          145        107      130     49       483          55
 *   0.84          162        176      134     59       595         108
 *
 * At 0.86 and below the broad queries drift back into the cap and the number
 * goes back to being the cap. At 0.90 and above the drop-off is too sharp to
 * be about quality: the graduation quiz has 2,950 eligible gifts and would
 * show four, because its top scorer sits well clear of a dense pack rather
 * than because the pack is bad. 0.88 is the widest cut where every query still
 * returns a page worth browsing and no two return the same length.
 *
 * The one query that still reaches the ceiling is coworker/Tech, and honestly
 * so: its scores cluster (median 0.745 against a top of 0.883) because a great
 * many tech gifts fit a coworker equally well. That is a real answer.
 */
const QUALITY_RATIO = 0.88;

/**
 * Never cut below this, however sharply the scores fall away.
 *
 * The ratio is relative to the single best match, so one unusually strong
 * outlier can drag the bar above a perfectly good field behind it. A floor
 * means the worst case is a short page rather than an empty-looking one.
 * Deliberately under PAGE_SIZE in the UI, so hitting it renders as one
 * complete screen rather than as a truncated one.
 *
 * It did not trigger on any of the six measured quizzes, which is the shape a
 * safety net should have.
 */
const MIN_RESULTS = 24;

/**
 * How many of the top-scoring candidates the diversity pass considers.
 *
 * selectDiverse is greedy: every slot rescans everything still in the running,
 * and each rescan does a title-token comparison. That is fine over hundreds of
 * candidates and quadratic-feeling over thousands — a broad query put ~11,000
 * rows through 150 slots, and the route measured 610 ms on a laptop but 1.4 s
 * on the function, which is the shape of a CPU bound rather than a database
 * one.
 *
 * Four times the result cap. The penalties diversity applies are small — 0.055
 * per platform repeat, 0.3 for a near-duplicate — so a candidate sitting more
 * than 450 places below the cut could only reach the page if almost everything
 * above it were penalised at once, which cannot happen when the pool is this
 * much larger than the page.
 */
const DIVERSITY_POOL = MAX_RESULTS * 4;

/**
 * A shopper runs a handful of searches in a session, not dozens a minute. The
 * ceiling is set well above real use and well below what it costs to be
 * scraped: each call scans thousands of rows, so this is a bill as much as a
 * load.
 */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const limit = rateLimit(`recommend:${clientKey(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const json = await request.json().catch(() => null);
  const body = parseRecommendBody(json);

  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // A ceiling at the top of the slider means "and up" rather than a hard cap.
  // The floor is whatever the user set, so unlike the old single-slider version
  // there is no need to invent one — dragging the ceiling to the end no longer
  // implies "premium", it just removes the lid.
  const uncapped = body.maxBudget >= BUDGET_UNCAPPED_AT;

  // Hard constraints in SQL: anything failing these can never be a good gift.
  // A gender pick keeps unisex products — it only excludes the opposite tag.
  //
  // The interest overlap belongs here too, and used to be applied in JS after
  // the fact. MIN_INTEREST_MATCHES means a gift sharing no interest with the
  // selection can never be returned, so fetching those rows only to drop them
  // was pure waste — and it grew with the catalogue: a broad query pulled
  // 14,468 rows across the wire to keep about 3,900, and the route went from
  // its documented 100-300 ms to over 1.5 s. `hasSome` runs on the existing GIN
  // index over interests.
  //
  // Guarded on a non-empty selection because `hasSome: []` matches nothing;
  // with no interests chosen every gift would fail MIN_INTEREST_MATCHES anyway,
  // so the two agree.
  const where = {
    price: uncapped
      ? { gte: body.minBudget }
      : { gte: body.minBudget, lte: body.maxBudget },
    ageMin: { lte: body.age },
    ageMax: { gte: body.age },
    // "Just Because" is the absence of an occasion, so it filters on none.
    // Every other value is a tag the import query wrote.
    ...(body.occasion !== JUST_BECAUSE && { occasions: { has: body.occasion } }),
    ...(body.gender !== "any" && { gender: { in: [body.gender, "unisex"] } }),
  };

  const gifts = await prisma.gift.findMany({
    where: {
      ...where,
      ...(body.interests.length > 0 && { interests: { hasSome: body.interests } }),
    },
    // Only what *scoring and diversity* read — not what the response renders.
    //
    // `description` was dropped long ago for being half the bytes; the same
    // argument applies to imageUrl, productUrl and currency, which no scoring
    // step touches and which are long strings. They are fetched below for the
    // 150 rows that survive, instead of for every candidate: on a broad query
    // that is 150 rows carrying URLs rather than 11,232.
    //
    // `gender` and `occasions` are filtered on above but never read after, so
    // they stay out too.
    select: {
      id: true,
      name: true,
      price: true,
      platform: true,
      interests: true,
      ageMin: true,
      ageMax: true,
      giftScore: true,
      category: true,
    },
  });

  const scored = gifts.map((gift) => {
    const price = Number(gift.price);
    const breakdown = scoreGift({
      giftInterests: gift.interests,
      giftPrice: price,
      giftAgeMin: gift.ageMin,
      giftAgeMax: gift.ageMax,
      giftScore: gift.giftScore,
      platform: gift.platform,
      selectedInterests: body.interests,
      relationship: body.relationship,
      age: body.age,
      minBudget: body.minBudget,
      // Uncapped: no ceiling exists, so price-fit switches to "pricier is
      // better" rather than measuring position inside a band that has no end.
      maxBudget: uncapped ? Number.POSITIVE_INFINITY : body.maxBudget,
    });

    // Does what the thing *is* suit why they are shopping? Nothing else in
    // scoring asks: a book can score beautifully as a gift and still be the
    // wrong thing to bring to a housewarming.
    const fit = occasionGiftFit(body.occasion, gift.name, gift.category);

    return { gift, price, breakdown: { ...breakdown, total: breakdown.total * fit } };
  });

  // Accuracy over volume: never pad with items that share no interests.
  //
  // The other two tests are the same ones the occasion landing pages already
  // apply, and there was no reason for the quiz — the main path — to be the
  // lenient one. Occasions come from the import query rather than the product,
  // so a "Custom Face Birthday Banner" keeps a Valentine's tag its own title
  // contradicts; and Etsy returns sellers' listings in their own language.
  const eligible = scored.filter(
    (entry) =>
      entry.breakdown.interestMatches >= MIN_INTEREST_MATCHES &&
      !namesADifferentOccasion(entry.gift.name, body.occasion) &&
      !tooCrudeForOccasion(entry.gift.name, body.occasion) &&
      !looksNonEnglish(entry.gift.name),
  );

  // Relevance ordering first, then a diversity pass. Without it a single brand
  // whose catalogue all shares one interest tag takes every slot on the page.
  const ordered = [...eligible].sort(
    (a, b) => b.breakdown.total - a.breakdown.total || b.price - a.price,
  );

  // The quality cut. What decides the length of a page, in place of a slot
  // count: keep everything scoring within QUALITY_RATIO of the strongest match
  // and let the total fall out of how much genuinely fit.
  //
  // Before the diversity pass rather than after it. Diversity discounts a
  // candidate for repeating what is already picked, so filtering on the raw
  // score afterwards mixes two different judgments and gives back a page that
  // is neither the best matches nor a full one. Cutting first means everything
  // the diversity pass arranges has already earned its place.
  const best = ordered[0]?.breakdown.total ?? 0;
  const worthShowing = ordered.filter((entry) => entry.breakdown.total >= best * QUALITY_RATIO);

  const qualified =
    worthShowing.length >= MIN_RESULTS ? worthShowing : ordered.slice(0, MIN_RESULTS);

  // Only the strongest candidates reach the diversity pass; see DIVERSITY_POOL.
  const pool = qualified.slice(0, DIVERSITY_POOL);

  const picked = selectDiverse(
    pool.map((entry) => ({
      score: entry.breakdown.total,
      platform: entry.gift.platform,
      name: entry.gift.name,
      interests: entry.gift.interests,
      price: entry.price,
    })),
    MAX_RESULTS,
    body.interests,
    { min: body.minBudget, max: uncapped ? Number.POSITIVE_INFINITY : body.maxBudget },
  );

  const chosen = picked.map((index) => pool[index]);

  // The display half, for the survivors only. `description` is deliberately
  // still not fetched — nothing renders it.
  const display = await prisma.gift.findMany({
    where: { id: { in: chosen.map((entry) => entry.gift.id) } },
    select: { id: true, currency: true, imageUrl: true, productUrl: true, brand: true },
  });
  const byId = new Map(display.map((row) => [row.id, row]));

  const results: GiftRecommendation[] = chosen.flatMap(({ gift, price, breakdown }) => {
    const row = byId.get(gift.id);
    // Only possible if a row was deleted between the two queries.
    if (!row) return [];
    return [
      {
        id: gift.id,
        name: gift.name,
        price,
        originalCurrency: row.currency,
        imageUrl: row.imageUrl,
        productUrl: row.productUrl,
        platform: gift.platform,
        brand: row.brand,
        category: gift.category,
        matchScore: breakdown.interestMatches,
      },
    ];
  });

  // Lets the UI distinguish "nothing fit your interests" from "nothing fit your
  // occasion/age/budget at all", which need different advice. Only worth a
  // query when there is nothing to show — on the happy path the number is
  // never rendered, and counting rows the SQL above deliberately skipped would
  // give back the cost this route just saved.
  const candidateCount =
    results.length > 0 ? gifts.length : await prisma.gift.count({ where });

  return NextResponse.json({ results, candidateCount });
}
