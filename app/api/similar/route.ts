import { NextResponse } from "next/server";
import { BUDGET_UNCAPPED_AT } from "@/lib/gift-options";
import { prisma } from "@/lib/prisma";
import { parseRecommendBody } from "@/lib/recommend-request";
import { SAME_LISTING_SIMILARITY, scoreSimilarity, selectDiverse } from "@/lib/ranking";
import type { GiftRecommendation, SimilarRequestBody } from "@/lib/types";

/**
 * Two rows of four on a desktop grid. Small on purpose: this is a detour from
 * the results the shopper already asked for, and a strip that outgrows the
 * page stops reading as "more like this one" and starts competing with it.
 */
const MAX_SIMILAR = 8;

/**
 * Subtracted from the similarity of anything already on the results page.
 * Larger than the score's whole range, so a card the shopper has already
 * scrolled past can never outrank a genuine discovery — but the demoted ones
 * still fill the strip when there are no discoveries left.
 *
 * Banning them outright was worse: on a narrow query the grid already holds
 * every candidate, and the panel came back empty on the one product the
 * shopper actually pointed at.
 */
const SEEN_DEMOTION = 1;

/**
 * Ceiling on the ids a client may ask us to skip. The grid holds at most
 * MAX_RESULTS (150) cards, so this is generous — it exists so a hand-rolled
 * request can't turn the exclusion list into an unbounded scan.
 */
const MAX_EXCLUDED = 300;

function parseSimilarBody(body: unknown): SimilarRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { giftId, excludeIds } = body as Record<string, unknown>;

  if (typeof giftId !== "string" || giftId.trim().length === 0) return null;
  if (
    excludeIds !== undefined &&
    (!Array.isArray(excludeIds) || !excludeIds.every((id) => typeof id === "string"))
  ) {
    return null;
  }

  // The quiz answers ride along unchanged, so they get the same validation the
  // recommend route gives them.
  const answers = parseRecommendBody(body);
  if (!answers) return null;

  return { ...answers, giftId, excludeIds: (excludeIds ?? []).slice(0, MAX_EXCLUDED) };
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const body = parseSimilarBody(json);

  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const anchor = await prisma.gift.findUnique({
    where: { id: body.giftId },
    select: { id: true, name: true, price: true, platform: true, interests: true },
  });

  if (!anchor) {
    return NextResponse.json({ error: "Unknown gift" }, { status: 404 });
  }

  const uncapped = body.maxBudget >= BUDGET_UNCAPPED_AT;
  const anchorPrice = Number(anchor.price);

  // Same hard constraints as the quiz: "more like this" is still shopping for
  // the same person, so nothing here may fall outside their occasion, the
  // recipient's age, or the budget they set.
  //
  // What it deliberately drops is MIN_INTEREST_MATCHES against the *quiz*
  // answers. The shopper has just told us something the quiz never asked by
  // pointing at a product, and honouring the anchor is the whole feature —
  // an item that shares the anchor's tags but none of the six they ticked is
  // exactly the discovery this is for.
  const candidates = await prisma.gift.findMany({
    where: {
      id: { not: anchor.id },
      price: uncapped
        ? { gte: body.minBudget }
        : { gte: body.minBudget, lte: body.maxBudget },
      ageMin: { lte: body.age },
      ageMax: { gte: body.age },
      occasions: { has: body.occasion },
      ...(body.gender !== "any" && { gender: { in: [body.gender, "unisex"] } }),
      // Sharing at least one tag with the anchor is the cheapest possible
      // definition of "related", and it runs on the GIN index rather than
      // dragging the whole occasion into memory to be scored. An untagged
      // anchor has nothing to match on, so it falls back to the filters above.
      ...(anchor.interests.length > 0 && { interests: { hasSome: anchor.interests } }),
    },
    // Same reasoning as the recommend route: `description` is half the bytes
    // and nothing downstream reads it.
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      imageUrl: true,
      productUrl: true,
      platform: true,
      interests: true,
      category: true,
    },
  });

  // Cards already on the results page behind the overlay. Worth showing last
  // rather than not at all: they are still the nearest things to the anchor.
  const seen = new Set(body.excludeIds);

  const scored = candidates
    .map((gift) => {
      const price = Number(gift.price);
      const similarity = scoreSimilarity({
        anchorInterests: anchor.interests,
        anchorTitle: anchor.name,
        anchorPrice,
        anchorPlatform: anchor.platform,
        candidateInterests: gift.interests,
        candidateTitle: gift.name,
        candidatePrice: price,
        candidatePlatform: gift.platform,
      });

      return {
        gift,
        price,
        similarity,
        rank: similarity.total - (seen.has(gift.id) ? SEEN_DEMOTION : 0),
      };
    })
    // The same listing under another seller, or a size variant of the anchor.
    .filter((entry) => entry.similarity.titleOverlap < SAME_LISTING_SIMILARITY);

  const ordered = scored.sort((a, b) => b.rank - a.rank);

  // Still worth diversifying eight slots: a brand whose entire catalogue
  // carries one tag would otherwise supply all of them, which reads as an ad.
  const picked = selectDiverse(
    ordered.map((entry) => ({
      score: entry.rank,
      platform: entry.gift.platform,
      name: entry.gift.name,
    })),
    MAX_SIMILAR,
  );

  const results: GiftRecommendation[] = picked
    .map((index) => ordered[index])
    .map(({ gift, price }) => ({
      id: gift.id,
      name: gift.name,
      price,
      originalCurrency: gift.currency,
      imageUrl: gift.imageUrl,
      productUrl: gift.productUrl,
      platform: gift.platform,
      category: gift.category,
      // Against the quiz answers, not the anchor — the badge means the same
      // thing here as it does everywhere else on the page.
      matchScore: gift.interests.filter((interest) => body.interests.includes(interest)).length,
    }));

  return NextResponse.json({ results });
}
