import { NextResponse } from "next/server";
import { BUDGET_MAX } from "@/lib/gift-options";
import { prisma } from "@/lib/prisma";
import { MIN_INTEREST_MATCHES, scoreGift } from "@/lib/ranking";
import type { GiftRecommendation, RecommendRequestBody } from "@/lib/types";

/**
 * Generous cap — typical queries have 150–300 qualifying gifts, and the UI
 * reveals them progressively rather than painting all of them at once.
 */
const MAX_RESULTS = 72;

function parseBody(body: unknown): RecommendRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { relationship, age, gender, occasion, interests, budget } = body as Record<string, unknown>;

  if (typeof relationship !== "string" || relationship.trim().length === 0) return null;
  if (typeof occasion !== "string" || occasion.trim().length === 0) return null;
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age > 120) return null;
  if (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0) return null;
  if (gender !== "male" && gender !== "female" && gender !== "any") return null;
  if (!Array.isArray(interests) || !interests.every((interest) => typeof interest === "string")) {
    return null;
  }

  return { relationship, age, gender, occasion, interests, budget };
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const body = parseBody(json);

  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // The top budget preset is labelled "$500+": no upper limit, but it's a
  // premium signal — a $60 trinket under "no limit" reads as a mistake. So
  // uncapped mode swaps the ceiling for a floor at half of BUDGET_MAX.
  const uncapped = body.budget >= BUDGET_MAX;
  const premiumFloor = BUDGET_MAX / 2;

  // Hard constraints in SQL: anything failing these can never be a good gift.
  // A gender pick keeps unisex products — it only excludes the opposite tag.
  const gifts = await prisma.gift.findMany({
    where: {
      price: uncapped ? { gte: premiumFloor } : { lte: body.budget },
      ageMin: { lte: body.age },
      ageMax: { gte: body.age },
      occasions: { has: body.occasion },
      ...(body.gender !== "any" && { gender: { in: [body.gender, "unisex"] } }),
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
      // Uncapped: no budget ceiling exists, so the price-fit signal goes flat
      // (ratio ~0 → constant 0.5) instead of zeroing out everything above $500.
      budget: uncapped ? Number.POSITIVE_INFINITY : body.budget,
    });

    return { gift, price, breakdown };
  });

  const results: GiftRecommendation[] = scored
    // Accuracy over volume: never pad with items that share no interests.
    .filter((entry) => entry.breakdown.interestMatches >= MIN_INTEREST_MATCHES)
    .sort((a, b) => b.breakdown.total - a.breakdown.total || b.price - a.price)
    .slice(0, MAX_RESULTS)
    // `description` is deliberately not sent — nothing renders it, and at 72
    // results its ~400 chars each would dominate the payload.
    .map(({ gift, price, breakdown }) => ({
      id: gift.id,
      name: gift.name,
      price,
      originalCurrency: gift.currency,
      imageUrl: gift.imageUrl,
      affiliateUrl: gift.affiliateUrl,
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
