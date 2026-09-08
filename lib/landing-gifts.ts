import {
  HOUSEHOLD_ESSENTIALS,
  MIN_PREFERRED_SCORE,
  namesADifferentOccasion,
  occasionGiftFit,
  preferredCategoriesFor,
  tooCrudeForOccasion,
} from "@/lib/occasion-fit";
import { JUST_BECAUSE } from "@/lib/gift-options";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * The product selection behind every crawled landing page.
 *
 * Extracted from app/gifts/[occasion]/page.tsx when the audience pages
 * (/gifts/birthday/for-gamers) arrived, because two routes ranking gifts by
 * subtly different rules is how one of them quietly becomes the worse page.
 * `narrow` is the only difference between them: the audience route passes an
 * interest filter, the occasion route passes nothing.
 */

/**
 * Pull a spread across price tiers rather than the cheapest N — a page showing
 * twelve $9 trinkets reads as junk, and a page of only $900 watches is useless
 * to most visitors.
 */
/** Quality bar for a landing page. See the fallback below for when it bites. */
const MIN_LANDING_SCORE = 55;

export async function getLandingGifts(occasion: string, narrow?: Prisma.GiftWhereInput) {
  const tiers = [
    { lte: 50 },
    { gt: 50, lte: 150 },
    { gt: 150 },
  ];

  const select = {
    id: true,
    name: true,
    price: true,
    currency: true,
    imageUrl: true,
    productUrl: true,
    platform: true,
    brand: true,
    giftScore: true,
    category: true,
  };

  const results = await Promise.all(
    tiers.map(async (price) => {
      // "Just Because" carries no tag: it means no occasion constraint, so
      // the clause is dropped rather than matched. See JUST_BECAUSE.
      const where = {
        ...(occasion !== JUST_BECAUSE && { occasions: { has: occasion } }),
        ...narrow,
        price,
        // These pages are curated and crawled: eight hand-ranked cards standing
        // for the whole catalogue. A card with no photo is not worth one of the
        // eight, and unlike the quiz there is no long tail here for it to sink
        // into, so the landing pages exclude rather than demote.
        imageOk: true,
      };

      // Best first, not cheapest first. Ordering by price ascending put $1-3
      // Etsy filler at the top of every landing page — a birthday face tattoo
      // and a custom banner led /gifts/valentines-day — because the cheapest
      // thing in a tier is reliably the least gift-like thing in it.
      //
      // Over-fetches because the mismatch filter below runs in JS: occasions
      // are an import-query artefact and cannot be trusted in SQL alone.
      const strong = await prisma.gift.findMany({
        where: { ...where, giftScore: { gte: MIN_LANDING_SCORE } },
        orderBy: [{ giftScore: "desc" }, { price: "asc" }],
        take: 40,
        select,
      });

      // giftScore alone is occasion-blind, which is why a special-edition
      // Wuthering Heights led housewarming, wedding and anniversary at once.
      // Re-ranked on giftScore weighted by how well the category suits the
      // occasion, so what belongs at a housewarming leads a housewarming.
      const byFit = <T extends { name: string; giftScore: number | null; category: string | null }>(rows: T[]) =>
        [...rows].sort(
          (a, b) =>
            (b.giftScore ?? 0) * occasionGiftFit(occasion, b.name, b.category) -
            (a.giftScore ?? 0) * occasionGiftFit(occasion, a.name, a.category),
        );

      const usable = <T extends { name: string }>(rows: T[]) =>
        rows.filter(
          (g) => !namesADifferentOccasion(g.name, occasion) && !tooCrudeForOccasion(g.name, occasion),
        );

      const fit = byFit(usable(strong));

      // Reserve slots for household essentials.
      //
      // The scorer rates a gift by how it reads to unwrap, so an appliance
      // never clears the landing floor: the air fryers score a median of 26
      // against 55. Exempting them from the floor alone changes nothing,
      // because ranking is score-driven and 26 x 1.18 still loses to a candle
      // at 60 - so the exemption has to guarantee a place rather than merely
      // permit one. Two of eight, only when the fit ranking found none, and
      // only for occasions that name preferred categories at all.
      const preferred = preferredCategoriesFor(occasion);
      const essentials = HOUSEHOLD_ESSENTIALS.filter((c) => preferred.includes(c));
      const RESERVED = 2;
      if (essentials.length > 0 && fit.length >= 8) {
        const already = fit.slice(0, 8).filter((g) => g.category && essentials.includes(g.category)).length;
        if (already === 0) {
          const useful = await prisma.gift.findMany({
            where: {
              ...where,
              category: { in: essentials },
              giftScore: { gte: MIN_PREFERRED_SCORE, lt: MIN_LANDING_SCORE },
            },
            orderBy: [{ giftScore: "desc" }, { price: "asc" }],
            take: 20,
            select,
          });
          const picks = byFit(usable(useful)).slice(0, RESERVED);
          if (picks.length > 0) return [...fit.slice(0, 8 - picks.length), ...picks];
        }
      }

      if (fit.length >= 8) return fit.slice(0, 8);

      // Thin occasions — Vaisakhi, Onam — do not have 8 well-scored gifts in
      // every price tier, and an empty tier is worse than a mediocre one. Note
      // `giftScore: { not: null }`: Postgres sorts nulls first on DESC, so
      // without it the 20 rows that failed scoring would lead the page.
      const rest = await prisma.gift.findMany({
        where: { ...where, giftScore: { not: null, lt: MIN_LANDING_SCORE } },
        orderBy: [{ giftScore: "desc" }, { price: "asc" }],
        take: 40,
        select,
      });

      return [...fit, ...byFit(usable(rest))].slice(0, 8);
    }),
  );

  return results.flat().map((g) => ({
    id: g.id,
    name: g.name,
    price: Number(g.price),
    originalCurrency: g.currency,
    imageUrl: g.imageUrl,
    productUrl: g.productUrl,
    platform: g.platform,
    brand: g.brand,
  }));
}

