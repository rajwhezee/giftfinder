import Link from "next/link";
import { GiftMark } from "@/components/GiftMark";
import { QuizLauncher } from "@/components/QuizLauncher";
import { OCCASION_EMOJI } from "@/lib/gift-option-icons";
import { OCCASIONS } from "@/lib/gift-options";
import { occasionToSlug } from "@/lib/occasion-slugs";
import { prisma } from "@/lib/prisma";

/**
 * Rebuild daily, matching the occasion pages. The headline figures are counted
 * from the catalogue rather than typed in — the previous hard-coded "4,000
 * gifts" had drifted to under 60% of the real total as imports were added, and
 * a number nobody trusts is worse than no number.
 */
export const revalidate = 86400;

/**
 * Round down to a clean figure so the line reads as a claim rather than a
 * readout — "7,000+ gifts" is a promise you always beat, where "7,226" invites
 * the reader to wonder why it moved. Never returns below one step, so a small
 * catalogue can't render "0+".
 */
function roundedFloor(value: number, step: number): number {
  return Math.max(step, Math.floor(value / step) * step);
}

/**
 * Crawlable entry points into the occasion pages. The quiz itself is a client
 * component that renders no gift markup, so without these Google would find a
 * single page with nothing to index.
 */
const FEATURED_OCCASIONS = [
  "Birthday",
  "Christmas",
  "Anniversary",
  "Diwali",
  "Valentine's Day",
  "Wedding",
  "Eid al-Fitr",
  "Mother's Day",
  "Graduation",
  "Lunar New Year",
  "Housewarming",
  "Raksha Bandhan",
];

export default async function Home() {
  // groupBy over platform rather than a distinct count: Prisma has no
  // countDistinct, and the group list is small enough that its length is the
  // cheapest way to get the number of shops we carry.
  const [giftCount, platforms] = await Promise.all([
    prisma.gift.count(),
    prisma.gift.groupBy({ by: ["platform"] }),
  ]);

  return (
    // min-height + centering pulls the content to the optical middle on tall
    // screens. Once results push past that height the container simply grows,
    // so nothing is ever clipped off the top.
    <main className="relative flex min-h-[calc(100svh-13rem)] flex-col justify-center px-4 py-14 sm:py-16">
      <GiftMark />

      <div className="relative z-10">
        <div className="mx-auto max-w-2xl text-center">
          {/* One "over" carries the rounding for the whole line, so the dot is
              the only separator and the only symbol doing any work. Mixing "+"
              with "·" read as two competing punctuation systems. */}
          <p className="text-xs tracking-[0.2em] text-ink-faint uppercase text-balance">
            Over {roundedFloor(giftCount, 1000).toLocaleString("en-US")} gifts ·{" "}
            {roundedFloor(platforms.length, 5)} brands · {OCCASIONS.length} occasions
          </p>

          <h1 className="font-display mt-6 text-4xl leading-[1.08] font-semibold text-balance sm:text-6xl">
            The gift they didn&rsquo;t know to <span className="accent-word">ask</span> for.
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-pretty text-ink-soft">
            Thousands of gifts from brands worth buying, narrowed down to the few they&apos;ll
            genuinely love. Nothing sponsored, nothing paid to rank.
          </p>

          <div
            aria-hidden
            className="mx-auto mt-8 flex items-center justify-center gap-3 text-ink-faint"
          >
            <span className="h-px w-10 bg-rule" />
            <span className="text-sm">✦</span>
            <span className="h-px w-10 bg-rule" />
          </div>
        </div>

        <div className="mt-10">
          <QuizLauncher />
        </div>

        <section className="mx-auto mt-20 max-w-3xl text-center">
          <h2 className="font-display text-xl font-semibold">Or browse by occasion</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Curated gifts for the occasions people shop for most.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {FEATURED_OCCASIONS.map((occasion) => (
              <Link
                key={occasion}
                href={`/gifts/${occasionToSlug(occasion)}`}
                className="chip rounded-full px-4 py-2 text-sm"
              >
                {OCCASION_EMOJI[occasion] && (
                  <span className="mr-1.5">{OCCASION_EMOJI[occasion]}</span>
                )}
                {occasion}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
