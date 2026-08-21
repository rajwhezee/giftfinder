import type { Metadata } from "next";
import Link from "next/link";
import { OCCASION_EMOJI } from "@/lib/gift-option-icons";
import { FEATURED_OCCASIONS } from "@/lib/gift-options";
import { occasionToSlug } from "@/lib/occasion-slugs";

export const metadata: Metadata = {
  title: "Page not found | Gift Finder",
  description: "That page has moved or never existed. Start the gift quiz or browse by occasion.",
};

/**
 * Replaces Next's stock "404: This page could not be found."
 *
 * A dead end on a site nobody has an account on is a lost visitor, so this
 * offers the two things that actually help: the quiz, and a way into the
 * occasion pages. The occasion chips double as the internal links a 404 would
 * otherwise leak, which matters here because most hits on this page will be
 * stale links to occasion slugs that were renamed.
 *
 * No "Oops" and no apology copy. The visitor did nothing wrong and the fastest
 * useful thing is the buttons.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-13rem)] max-w-2xl flex-col justify-center px-4 py-16 text-center">
      <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">Error 404</p>

      <h1 className="font-display mt-5 text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        We could not find <span className="accent-word">that</span> one.
      </h1>

      <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-pretty text-ink-soft">
        The page has moved or never existed. The gifts are all still here, so pick up wherever you
        meant to start.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/#launch"
          className="btn-primary inline-flex items-center gap-2.5 rounded-full px-8 py-3.5 text-base font-medium"
        >
          Find their gift
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/"
          className="chip rounded-full px-6 py-3.5 text-base font-medium"
        >
          Back to home
        </Link>
      </div>

      <div className="rule-hairline mt-16 border-t pt-10">
        <h2 className="text-xs tracking-[0.2em] text-ink-faint uppercase">Or browse by occasion</h2>
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
      </div>
    </main>
  );
}
