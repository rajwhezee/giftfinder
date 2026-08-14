import Link from "next/link";
import { GiftMark } from "@/components/GiftMark";
import { QuizLauncher } from "@/components/QuizLauncher";
import { OCCASION_EMOJI } from "@/lib/gift-option-icons";
import { occasionToSlug } from "@/lib/occasion-slugs";

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

export default function Home() {
  return (
    // min-height + centering pulls the content to the optical middle on tall
    // screens. Once results push past that height the container simply grows,
    // so nothing is ever clipped off the top.
    <main className="relative flex min-h-[calc(100svh-13rem)] flex-col justify-center px-4 py-14 sm:py-16">
      <GiftMark />

      <div className="relative z-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">
            4,000 gifts · 35 occasions
          </p>

          <h1 className="font-display mt-6 text-4xl leading-[1.08] font-semibold text-balance sm:text-6xl">
            Find something they&apos;ll <span className="accent-word">actually</span> keep.
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-pretty text-ink-soft">
            Six quick taps — who it&apos;s for, what they&apos;re into, what you want to spend. No
            endless scrolling, no sponsored clutter, no commission.
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
            Ready-made edits for the occasions people shop for most.
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
