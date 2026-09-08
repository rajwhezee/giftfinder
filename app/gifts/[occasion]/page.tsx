import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaticGiftCard } from "@/components/StaticGiftCard";
import { getLandingGifts } from "@/lib/landing-gifts";
import { OCCASION_EMOJI } from "@/lib/gift-option-icons";
import { OCCASIONS } from "@/lib/gift-options";
import { occasionToSlug, slugToOccasion } from "@/lib/occasion-slugs";
import { AUDIENCE_PAIRS, audienceBySlug } from "@/lib/long-tail";
import { jsonLdScript } from "@/lib/json-ld";

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

export default async function OccasionPage({
  params,
}: {
  params: Promise<{ occasion: string }>;
}) {
  const { occasion: slug } = await params;
  const occasion = slugToOccasion(slug);
  if (!occasion) notFound();

  const gifts = await getLandingGifts(occasion);
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

  // Two graphs in one script: JSON-LD takes an array, and a second <script>
  // would only be more markup for the same result. The trail matches the
  // visible breadcrumb below exactly, which is the condition for it counting.
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Gift Finder", item: SITE },
      { "@type": "ListItem", position: 2, name: `${occasion} gifts`, item: `${SITE}/gifts/${slug}` },
    ],
  };

  const others = OCCASIONS.filter((o) => o !== occasion);

  // The narrower shortlists under this occasion. These links are the only way
  // a crawler reaches them from inside the site: a sitemap entry gets a URL
  // discovered, an internal link is what gets it crawled and counted.
  const shortlists = AUDIENCE_PAIRS.filter((p) => p.occasion === occasion).map(
    (p) => audienceBySlug(p.audience)!,
  );

  return (
    <main className="px-4 py-14 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([jsonLd, breadcrumbs]) }}
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

        {shortlists.length > 0 && (
          <section className="rule-hairline mt-20 border-t pt-10">
            <h2 className="font-display mb-5 text-xl font-semibold">
              Narrow it down
            </h2>
            <div className="flex flex-wrap gap-2">
              {shortlists.map((audience) => (
                <Link
                  key={audience.slug}
                  href={`/gifts/${slug}/for-${audience.slug}`}
                  className="chip rounded-full px-4 py-2 text-sm"
                >
                  {occasion} gifts for {audience.label}
                </Link>
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
