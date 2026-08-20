import { NextResponse } from "next/server";
import { BUDGET_UNCAPPED_AT } from "@/lib/gift-options";
import { prisma } from "@/lib/prisma";
import { looksNonEnglish } from "@/lib/language";
import { namesADifferentOccasion, occasionCategoryFit } from "@/lib/occasion-fit";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { parseRecommendBody } from "@/lib/recommend-request";
import { MIN_INTEREST_MATCHES, scoreGift, selectDiverse } from "@/lib/ranking";
import type { GiftRecommendation } from "@/lib/types";

/**
 * Deliberately high enough that most queries fall *under* it.
 *
 * At 72 the cap was below the eligible count for almost every combination, so
 * every search returned exactly 72 results — which made the number read as a
 * quota rather than as a real answer. Sitting above the typical eligible count
 * means the total now varies with how much genuinely matched, and only
 * unusually broad queries get truncated.
 *
 * The UI reveals these progressively as the shopper scrolls, so a larger array
 * costs payload rather than render time.
 */
const MAX_RESULTS = 150;

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
    occasions: { has: body.occasion },
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
    const fit = occasionCategoryFit(body.occasion, gift.category);

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
      !looksNonEnglish(entry.gift.name),
  );

  // Relevance ordering first, then a diversity pass. Without it a single brand
  // whose catalogue all shares one interest tag takes every slot on the page.
  const ordered = [...eligible].sort(
    (a, b) => b.breakdown.total - a.breakdown.total || b.price - a.price,
  );

  // Only the strongest candidates reach the diversity pass; see DIVERSITY_POOL.
  const pool = ordered.slice(0, DIVERSITY_POOL);

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
    select: { id: true, currency: true, imageUrl: true, productUrl: true },
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
