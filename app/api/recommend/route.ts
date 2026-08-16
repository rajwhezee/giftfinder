import { NextResponse } from "next/server";
import { BUDGET_UNCAPPED_AT } from "@/lib/gift-options";
import { prisma } from "@/lib/prisma";
import { MIN_INTEREST_MATCHES, scoreGift, selectDiverse } from "@/lib/ranking";
import type { GiftRecommendation, RecommendRequestBody } from "@/lib/types";

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

function parseBody(body: unknown): RecommendRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { relationship, age, gender, occasion, interests, minBudget, maxBudget } =
    body as Record<string, unknown>;

  if (typeof relationship !== "string" || relationship.trim().length === 0) return null;
  if (typeof occasion !== "string" || occasion.trim().length === 0) return null;
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age > 120) return null;
  if (typeof minBudget !== "number" || !Number.isFinite(minBudget) || minBudget < 0) return null;
  if (typeof maxBudget !== "number" || !Number.isFinite(maxBudget) || maxBudget <= 0) return null;
  // An inverted range would silently return nothing, which reads as a broken
  // catalogue rather than a bad request.
  if (minBudget > maxBudget) return null;
  if (gender !== "male" && gender !== "female" && gender !== "any") return null;
  if (!Array.isArray(interests) || !interests.every((interest) => typeof interest === "string")) {
    return null;
  }

  return { relationship, age, gender, occasion, interests, minBudget, maxBudget };
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const body = parseBody(json);

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
  const gifts = await prisma.gift.findMany({
    where: {
      price: uncapped
        ? { gte: body.minBudget }
        : { gte: body.minBudget, lte: body.maxBudget },
      ageMin: { lte: body.age },
      ageMax: { gte: body.age },
      occasions: { has: body.occasion },
      ...(body.gender !== "any" && { gender: { in: [body.gender, "unisex"] } }),
    },
    // Only what scoring, diversity, and the response actually read. Without
    // this Prisma fetches every column, and `description` alone — used by
    // none of the three — was about half the bytes on a broad query
    // (1.5 MB of 3.1 MB across 6,076 candidate rows).
    //
    // `gender` and `occasions` are filtered on above but never read after, so
    // they stay out too.
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      imageUrl: true,
      productUrl: true,
      platform: true,
      interests: true,
      ageMin: true,
      ageMax: true,
    },
  });

  const scored = gifts.map((gift) => {
    const price = Number(gift.price);
    const breakdown = scoreGift({
      giftInterests: gift.interests,
      giftPrice: price,
      giftAgeMin: gift.ageMin,
      giftAgeMax: gift.ageMax,
      selectedInterests: body.interests,
      relationship: body.relationship,
      age: body.age,
      minBudget: body.minBudget,
      // Uncapped: no ceiling exists, so price-fit switches to "pricier is
      // better" rather than measuring position inside a band that has no end.
      maxBudget: uncapped ? Number.POSITIVE_INFINITY : body.maxBudget,
    });

    return { gift, price, breakdown };
  });

  // Accuracy over volume: never pad with items that share no interests.
  const eligible = scored.filter(
    (entry) => entry.breakdown.interestMatches >= MIN_INTEREST_MATCHES,
  );

  // Relevance ordering first, then a diversity pass. Without it a single brand
  // whose catalogue all shares one interest tag takes every slot on the page.
  const ordered = [...eligible].sort(
    (a, b) => b.breakdown.total - a.breakdown.total || b.price - a.price,
  );

  const picked = selectDiverse(
    ordered.map((entry) => ({
      score: entry.breakdown.total,
      platform: entry.gift.platform,
      name: entry.gift.name,
    })),
    MAX_RESULTS,
  );

  const results: GiftRecommendation[] = picked
    .map((index) => ordered[index])
    // `description` is deliberately not sent — nothing renders it, and at 72
    // results its ~400 chars each would dominate the payload.
    .map(({ gift, price, breakdown }) => ({
      id: gift.id,
      name: gift.name,
      price,
      originalCurrency: gift.currency,
      imageUrl: gift.imageUrl,
      productUrl: gift.productUrl,
      platform: gift.platform,
      matchScore: breakdown.interestMatches,
    }));

  return NextResponse.json({
    results,
    // Lets the UI distinguish "nothing fit your interests" from "nothing fit
    // your occasion/age/budget at all", which need different advice.
    candidateCount: gifts.length,
  });
}
