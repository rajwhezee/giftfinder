import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaticGiftCard } from "@/components/StaticGiftCard";
import { getLandingGifts } from "@/lib/landing-gifts";
import { OCCASION_EMOJI } from "@/lib/gift-option-icons";
import { AUDIENCE_PAIRS, audienceBySlug, type Audience } from "@/lib/long-tail";
import { occasionToSlug, slugToOccasion } from "@/lib/occasion-slugs";
import { jsonLdScript } from "@/lib/json-ld";

const SITE = "https://thegiftfinder.net";

/** Same cadence as the occasion pages above: prices drift, not by the minute. */
export const revalidate = 86400;

/**
 * Only the fifteen vetted pairs exist. Without this, /gifts/birthday/for-anything
 * would render on demand, and the whole point of a hand-checked list is that
 * combinations nobody vetted never become pages.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return AUDIENCE_PAIRS.map(({ occasion, audience }) => ({
    occasion: occasionToSlug(occasion),
    audience: `for-${audience}`,
  }));
}

/** `for-gamers` -> the Audience, and only if this pair is on the vetted list. */
function resolve(occasionSlug: string, audienceSlug: string): { occasion: string; audience: Audience } | null {
  const occasion = slugToOccasion(occasionSlug);
  if (!occasion || !audienceSlug.startsWith("for-")) return null;

  const audience = audienceBySlug(audienceSlug.slice("for-".length));
  if (!audience) return null;

  const vetted = AUDIENCE_PAIRS.some((p) => p.occasion === occasion && p.audience === audience.slug);
  return vetted ? { occasion, audience } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ occasion: string; audience: string }>;
}): Promise<Metadata> {
  const { occasion: occasionSlug, audience: audienceSlug } = await params;
  const resolved = resolve(occasionSlug, audienceSlug);
  if (!resolved) return {};

  const { occasion, audience } = resolved;
  const title = `${occasion} Gifts for ${audience.titleLabel} | Gift Finder`;
  const description = `Hand-picked ${occasion} gifts for ${audience.label}, across every budget, from independent makers and trusted shops. Nothing sponsored, nothing paid to rank.`;
  const url = `${SITE}/gifts/${occasionSlug}/${audienceSlug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, siteName: "Gift Finder" },
  };
}

const money = (n: number) => `$${Math.round(n)}`;

/**
 * The opening paragraph, built from the products actually on the page.
 *
 * Written from data rather than from a template with the audience swapped in,
 * because fifteen pages differing only by one noun is what a doorway page is,
 * and the price span, the categories and the makers genuinely differ per page.
 */
function intro(
  occasion: string,
  audience: Audience,
  gifts: { price: number; brand: string | null; platform: string }[],
): string {
  const prices = gifts.map((g) => g.price).sort((a, b) => a - b);
  const low = prices[0] ?? 0;
  const high = prices[prices.length - 1] ?? 0;

  const makers = [...new Set(gifts.map((g) => g.brand ?? g.platform))]
    .filter((m) => m !== "Etsy" && m !== "eBay")
    .slice(0, 3);

  const span = low && high ? ` between ${money(low)} and ${money(high)}` : "";
  const named = makers.length >= 2 ? ` Makers on this page include ${makers.slice(0, -1).join(", ")} and ${makers[makers.length - 1]}.` : "";

  return (
    `${gifts.length} ${occasion} gifts for ${audience.label}${span}, chosen for how well they read as a gift ` +
    `rather than by what pays us, because nothing here does.${named}`
  );
}

export default async function AudiencePage({
  params,
}: {
  params: Promise<{ occasion: string; audience: string }>;
}) {
  const { occasion: occasionSlug, audience: audienceSlug } = await params;
  const resolved = resolve(occasionSlug, audienceSlug);
  if (!resolved) notFound();

  const { occasion, audience } = resolved;
  const gifts = await getLandingGifts(occasion, { interests: { hasSome: audience.interests } });
  if (gifts.length === 0) notFound();

  const emoji = OCCASION_EMOJI[occasion];
  const url = `${SITE}/gifts/${occasionSlug}/${audienceSlug}`;

  // ItemList, not Product: these link to other retailers' listings and are not
  // ours to sell. Same reasoning as the occasion pages.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${occasion} gifts for ${audience.label}`,
    url,
    numberOfItems: gifts.length,
    itemListElement: gifts.map((gift, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: gift.name,
      url: gift.productUrl,
      image: gift.imageUrl,
    })),
  };

  // Three levels now, and it still has to match the visible trail exactly or
  // it does not count.
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Gift Finder", item: SITE },
      { "@type": "ListItem", position: 2, name: `${occasion} gifts`, item: `${SITE}/gifts/${occasionSlug}` },
      { "@type": "ListItem", position: 3, name: `For ${audience.label}`, item: url },
    ],
  };

  /** The other audiences vetted for this occasion, for the footer links. */
  const siblings = AUDIENCE_PAIRS.filter(
    (p) => p.occasion === occasion && p.audience !== audience.slug,
  ).map((p) => audienceBySlug(p.audience)!);

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
          <span className="mx-2">/</span>
          <Link href={`/gifts/${occasionSlug}`} className="transition-colors hover:text-terracotta">
            {occasion}
          </Link>
          <span className="mx-2">/</span>
          <span>For {audience.label}</span>
        </nav>

        <h1 className="font-display mt-6 text-4xl leading-tight font-semibold text-ink sm:text-5xl">
          {emoji && <span aria-hidden="true">{emoji}</span>} {occasion} gifts for {audience.label}
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-soft">
          {intro(occasion, audience, gifts)}
        </p>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-soft">
          Want something matched to one particular person rather than a shelf?{" "}
          <Link href="/" className="text-terracotta underline underline-offset-4">
            Answer six quick questions
          </Link>{" "}
          and the quiz will rank the whole catalogue against their age, interests and your budget.
        </p>

        <h2 className="font-display mt-14 text-2xl font-semibold text-ink">
          {gifts.length} ideas for {audience.label}
        </h2>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {gifts.map((gift) => (
            <StaticGiftCard key={gift.id} gift={gift} />
          ))}
        </div>

        {siblings.length > 0 && (
          <>
            <h2 className="font-display mt-16 text-2xl font-semibold text-ink">
              Other {occasion} shortlists
            </h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {siblings.map((sibling) => (
                <li key={sibling.slug}>
                  <Link
                    href={`/gifts/${occasionSlug}/for-${sibling.slug}`}
                    className="inline-block rounded-full border border-rule px-4 py-2 text-sm text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
                  >
                    For {sibling.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-12 text-sm text-ink-soft">
          <Link href={`/gifts/${occasionSlug}`} className="text-terracotta underline underline-offset-4">
            See all {occasion} gifts
          </Link>
        </p>
      </div>
    </main>
  );
}
