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
        <div className="mx-auto max-w-3xl text-center">
          {/* One "over" carries the rounding for the whole line, so the dot is
              the only separator and the only symbol doing any work. Mixing "+"
              with "·" read as two competing punctuation systems. */}
          <p className="text-xs tracking-[0.2em] text-ink-faint uppercase text-balance sm:text-sm">
            {/* Each count is bound to its own noun, and each separator to the
                item before it: at this tracking the line wraps on a phone, and
                without this it breaks between "135" and "brands". Same trick as
                the launcher's meta line below. */}
            <span className="whitespace-nowrap">
              Over {roundedFloor(giftCount, 1000).toLocaleString("en-US")} gifts ·
            </span>{" "}
            <span className="whitespace-nowrap">
              {roundedFloor(platforms.length, 5)} brands ·
            </span>{" "}
            <span className="whitespace-nowrap">{OCCASIONS.length} occasions</span>
          </p>

          <h1 className="font-display mt-7 text-5xl leading-[1.05] font-semibold text-balance sm:text-7xl">
            The gift they didn&rsquo;t know to <span className="accent-word">ask</span> for.
          </h1>

          {/* The whole proposition in one line: what the visitor supplies, what
              it costs them, and what they get back.

              This was two lines saying the same thing five rows apart — this
              one, and "Answer six quick questions about them and we'll find the
              one" above the button. Merging them is what removed the echo; the
              cost figure survives in the meta line under the button.

              Sized and coloured as supporting copy, ink-soft, a step above
              body. At text-2xl in full ink it was the only large
              full-strength Inter on a page where everything else is either
              Fraunces display or small quiet Inter, and it read as neither.

              The 💪 closes the sentence in place of a full stop. Kept
              unbreakable so it can never wrap onto a line of its own. */}
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-balance text-ink-soft sm:text-xl">
            Six quick questions about who it&rsquo;s for and what they like, we&rsquo;ll handle
            the rest{" "}
            <span className="whitespace-nowrap">&#x1F4AA;</span>
          </p>

          <div
            aria-hidden
            className="mx-auto mt-9 flex items-center justify-center gap-3 text-ink-faint"
          >
            <span className="h-px w-12 bg-rule" />
            <span className="text-base">✦</span>
            <span className="h-px w-12 bg-rule" />
          </div>
        </div>

        {/* Target for the "Find their gift" button at the foot of the page. */}
        <div id="launch" className="mt-11 scroll-mt-28">
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

        {/* Sits at the foot of the page, not above the button. Anyone ready
            to press "Launch" should not have to read a paragraph first; the
            people who scroll this far are the unconvinced ones, and the header
            link brings anyone here sooner who wants it.

            Written as a pitch rather than an explanation. The job is not to
            describe the mechanism, which the hero already does in one line, but
            to show the range: the closest person and the one you barely know,
            every occasion, every budget. Someone who reads it should be able to
            think of two people they need something for.

            The specifics are load-bearing. "The coworker retiring on Friday"
            does more than "all relationships" because it is somebody the reader
            can picture. The counts are real and come from the same query the
            eyebrow at the top uses.

            Every claim here is one the site can make: no affiliate layer
            exists. If that changes, this changes with it. */}
        <section
          id="about"
          className="rule-hairline mx-auto mt-24 max-w-3xl scroll-mt-24 border-t pt-14"
        >
          <p className="text-center text-xs tracking-[0.2em] text-ink-faint uppercase">
            What this is
          </p>
          <h2 className="font-display mx-auto mt-4 max-w-2xl text-center text-3xl leading-tight font-semibold text-balance sm:text-4xl">
            For everyone you have to buy for.
          </h2>

          <div className="mx-auto mt-8 max-w-2xl space-y-5 text-center text-base leading-relaxed text-pretty text-ink-soft sm:text-lg">
            <p>
              The person you know better than anyone, and the one down the hall whose surname you
              had to look up. Your mum. Your best friend. The teenager who already owns everything.
              The coworker retiring on Friday.
            </p>
            <p>
              Birthdays and weddings. Diwali, Eid, Lunar New Year. A housewarming, a graduation, a
              leaving card for someone in accounts. Ten dollars, or fifteen hundred. Something they
              will keep for years, or something that simply needs to look like you thought about
              it, because sometimes that is the honest brief.
            </p>
            <p className="text-ink">
              Six questions, about thirty seconds, and a page of real things from real shops, ranked
              for the person you just described. Nothing on it paid to be there.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs tracking-[0.16em] text-ink-faint uppercase">
            <span className="whitespace-nowrap">
              {roundedFloor(giftCount, 1000).toLocaleString("en-US")} gifts
            </span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">{roundedFloor(platforms.length, 5)} brands</span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">{OCCASIONS.length} occasions</span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">$10 to $1,500</span>
          </div>

          <div className="mt-10 text-center">
            <a
              href="#launch"
              className="btn-primary inline-flex items-center gap-2.5 rounded-full px-9 py-4 text-base font-medium"
            >
              Find their gift
              <span aria-hidden>→</span>
            </a>
          </div>

          <p className="mt-8 text-center text-sm text-ink-soft">
            How this is paid for, and why nothing here is,{" "}
            <Link href="/disclosure" className="text-terracotta underline underline-offset-4">
              on the disclosure page
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
