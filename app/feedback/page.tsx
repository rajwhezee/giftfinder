import type { Metadata } from "next";
import Link from "next/link";
import { FeedbackForm } from "@/components/FeedbackForm";
import { SUPPORT_PATH } from "@/lib/feedback";

export const metadata: Metadata = {
  title: "Give feedback | Gift Finder",
  description: "Tell us what would have made Gift Finder more useful.",
  // A form with no content of its own. Indexing it would add a thin page to a
  // site whose whole search surface is 37 deliberate ones, and it can never be
  // the right answer to a search. /support is the crawlable contact page.
  robots: { index: false, follow: true },
};

export default function FeedbackPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:py-20">
      <nav className="text-xs tracking-[0.14em] text-ink-faint uppercase">
        <Link href="/" className="transition-colors hover:text-terracotta">
          Gift Finder
        </Link>
        <span className="mx-2">/</span>
        <span>Feedback</span>
      </nav>

      <h1 className="font-display mt-6 text-4xl font-semibold">Give feedback</h1>

      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
        This site is a personal project with no ads, no sponsored placements and nothing paid to
        rank, which means there is no revenue telling anyone what is working. Suggestions are the
        only signal there is, so they genuinely decide what gets built.
      </p>

      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        Particularly useful: an occasion that is missing, a result that made no sense for the
        person you described, or a moment where you gave up. If you need a reply rather than a
        suggestion box,{" "}
        <Link href={SUPPORT_PATH} className="text-terracotta underline underline-offset-4">
          get in touch instead
        </Link>
        .
      </p>

      <div className="mt-10">
        <FeedbackForm />
      </div>

      <p className="mt-10 text-xs leading-relaxed text-ink-faint">
        Your message is stored on our own server so it can be read and acted on. An email address
        is only stored if you enter one, and is used to reply to you and nothing else. See the{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-terracotta">
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}
