import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaticGiftCard } from "@/components/StaticGiftCard";
import { namesADifferentOccasion } from "@/lib/occasion-fit";
import { OCCASION_EMOJI } from "@/lib/gift-option-icons";
import { OCCASIONS } from "@/lib/gift-options";
import { occasionToSlug, slugToOccasion } from "@/lib/occasion-slugs";
import { prisma } from "@/lib/prisma";

const SITE = "https://thegiftfinder.net";

/** Rebuild daily — prices and stock drift, but not minute to minute. */
export const revalidate = 86400;

export function generateStaticParams() {
  return OCCASIONS.map((occasion) => ({ occasion: occasionToSlug(occasion) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ occasion: string }>;
}): Promise<Metadata> {
  const { occasion: slug } = await params;
  const occasion = slugToOccasion(slug);
  if (!occasion) return {};

  const title = `${occasion} Gift Ideas | Thoughtful gifts people actually keep`;
  const description = `Hand-picked ${occasion} gifts from independent makers and trusted shops, across every budget. Answer six quick questions and get matches for the person you're buying for.`;
  const url = `${SITE}/gifts/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, siteName: "Gift Finder" },
  };
}

/**
 * Pull a spread across price tiers rather than the cheapest N — a page showing
 * twelve $9 trinkets reads as junk, and a page of only $900 watches is useless
 * to most visitors.
 */
/** Quality bar for a landing page. See the fallback below for when it bites. */
const MIN_LANDING_SCORE = 55;

async function getGiftsForOccasion(occasion: string) {
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
  };

  const results = await Promise.all(
    tiers.map(async (price) => {
      const where = { occasions: { has: occasion }, price };

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

      const fit = strong.filter((g) => !namesADifferentOccasion(g.name, occasion));
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

      return [...fit, ...rest.filter((g) => !namesADifferentOccasion(g.name, occasion))].slice(0, 8);
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
  }));
}

export default async function OccasionPage({
  params,
}: {
  params: Promise<{ occasion: string }>;
}) {
  const { occasion: slug } = await params;
  const occasion = slugToOccasion(slug);
  if (!occasion) notFound();

  const gifts = await getGiftsForOccasion(occasion);
  const emoji = OCCASION_EMOJI[occasion];

  // ItemList rather than a Product feed: these are links to other retailers'
  // products, not things we sell, so claiming Product/Offer markup would be
  // misrepresenting the page.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${occasion} gift ideas`,
    url: `${SITE}/gifts/${slug}`,
    numberOfItems: gifts.length,
    itemListElement: gifts.map((gift, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: gift.name,
      url: gift.productUrl,
      image: gift.imageUrl,
    })),
  };

  const others = OCCASIONS.filter((o) => o !== occasion);

  return (
    <main className="px-4 py-14 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-5xl">
        <nav className="text-xs tracking-[0.14em] text-ink-faint uppercase">
          <Link href="/" className="transition-colors hover:text-terracotta">
            Gift Finder
          </Link>
          <span className="mx-2" aria-hidden>
            /
          </span>
          <span>{occasion}</span>
        </nav>

        <header className="mt-6 max-w-2xl">
          <h1 className="font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl">
            {emoji && <span className="mr-2">{emoji}</span>}
            {occasion} gifts they&apos;ll <span className="accent-word">actually</span> keep
          </h1>
          <p className="mt-5 text-base leading-relaxed text-pretty text-ink-soft">
            {gifts.length > 0
              ? `A hand-picked spread of ${occasion} gifts across every budget, from independent makers on Etsy and small DTC labels through to recognisable brands. Every link goes straight to the seller, and we earn nothing from your purchase.`
              : `We're still building out our ${occasion} collection. Try the quiz. It searches the whole catalogue, not just this page.`}
          </p>

          <Link
            href="/"
            className="btn-primary mt-7 inline-flex rounded-full px-7 py-3 text-sm font-medium"
          >
            Find a gift for someone specific
          </Link>
        </header>

        {gifts.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display mb-6 text-2xl font-semibold">
              {gifts.length} ideas for {occasion}
            </h2>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {gifts.map((gift) => (
                <StaticGiftCard key={gift.id} gift={gift} />
              ))}
            </div>
          </section>
        )}

        <section className="rule-hairline mt-20 border-t pt-10">
          <h2 className="font-display mb-5 text-xl font-semibold">Browse other occasions</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((other) => (
              <Link
                key={other}
                href={`/gifts/${occasionToSlug(other)}`}
                className="chip rounded-full px-4 py-2 text-sm"
              >
                {OCCASION_EMOJI[other] && <span className="mr-1.5">{OCCASION_EMOJI[other]}</span>}
                {other}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
