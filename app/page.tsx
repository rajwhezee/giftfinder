import Link from "next/link";
import { GiftMark } from "@/components/GiftMark";
import { QuizLauncher } from "@/components/QuizLauncher";
import { FAQS } from "@/lib/faq";
import { OCCASION_EMOJI } from "@/lib/gift-option-icons";
import { FEATURED_OCCASIONS, OCCASIONS } from "@/lib/gift-options";
import { occasionToSlug } from "@/lib/occasion-slugs";
import { jsonLdScript } from "@/lib/json-ld";
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
 * The occasions the paragraph below names outright.
 *
 * Kept as a list rather than a hardcoded "28 more" so the count is derived: add
 * an occasion to lib/gift-options.ts and the sentence corrects itself. Naming
 * seven and silently ignoring the rest undersold the range, and this site's
 * whole claim is that it covers occasions other gift sites do not.
 */
const NAMED_IN_COPY = [
  "Birthday",
  "Wedding",
  "Diwali",
  "Eid al-Fitr",
  "Lunar New Year",
  "Housewarming",
  "Graduation",
] as const;

export default async function Home() {
  // groupBy over platform rather than a distinct count: Prisma has no
  // countDistinct, and the group list is small enough that its length is the
  // cheapest way to get the number of shops we carry.
  //
  // The third query feeds the band below the hero. A gift site whose landing page showed no gifts was
  // the largest thing missing from it: the catalogue is the entire asset and it
  // was invisible until you had answered six questions.
  //
  // Over-fetches and thins by platform in JS rather than asking Postgres for a
  // distinct-on: the page is revalidated daily, so this runs once a day rather
  // than per visit, and one brand's shelf taking the whole rail is the only
  // failure mode worth guarding.
  const [giftCount, platforms, showcase] = await Promise.all([
    prisma.gift.count(),
    prisma.gift.groupBy({ by: ["platform"] }),
    prisma.gift.findMany({
      where: { giftScore: { gte: 70 }, imageUrl: { not: "" } },
      orderBy: { giftScore: "desc" },
      take: 120,
      select: { id: true, name: true, price: true, platform: true, imageUrl: true },
    }),
  ]);

  const seenPlatforms = new Set<string>();
  const rail = showcase
    .filter((gift) => !seenPlatforms.has(gift.platform) && seenPlatforms.add(gift.platform))
    .slice(0, 8);

  return (
    // min-height + centering pulls the content to the optical middle on tall
    // screens. Once results push past that height the container simply grows,
    // so nothing is ever clipped off the top.
    <main className="relative flex min-h-[calc(100svh-13rem)] flex-col justify-center px-4 py-14 sm:py-16">
      {/* The questions people actually ask before trusting a recommender they
          have never heard of. Built from the same array the section below
          renders, so the structured text and the visible text cannot drift. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((entry) => ({
              "@type": "Question",
              name: entry.question,
              acceptedAnswer: { "@type": "Answer", text: entry.answer },
            })),
          }),
        }}
      />

      <GiftMark />

      <div className="relative z-10">
        {/* Deliberately off the centre axis.

            Every section of this page used to be centred inside max-w-3xl, top
            to bottom, which is the single loudest tell of a generated layout —
            one column, one axis, no tension anywhere. The headline now holds the
            left margin at full display size and the catalogue figures stack
            against it on the right, so the two halves balance rather than queue.

            Collapses to one column below lg, where a split would only make both
            halves too narrow to read. */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-x-16 gap-y-12 lg:grid-cols-[7fr_4fr]">
          <div>
            <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">
              Any occasion &middot; any culture
            </p>

            <h1 className="font-display mt-6 text-5xl leading-[0.98] font-semibold tracking-[-0.03em] text-balance sm:text-7xl lg:text-[5.5rem]">
              The gift they didn&rsquo;t know to <span className="accent-word">ask</span> for.
            </h1>

            {/* The whole proposition in one line: what the visitor supplies,
                what it costs them, and what they get back. Measure capped so it
                breaks under the headline rather than running its full width. */}
            <p className="mt-7 max-w-[36ch] text-lg leading-relaxed text-pretty text-ink-soft sm:text-xl">
              Six quick questions about who it&rsquo;s for and what they like, we&rsquo;ll handle
              the rest{" "}
              <span className="whitespace-nowrap">&#x1F4AA;</span>
            </p>
          </div>

          {/* The figures as a ledger rather than a line.

              These were a single centred row of small caps under the eyebrow,
              where they read as a disclaimer. Set as Fraunces numerals against
              their labels on hairline rules, the same figures read as a spec
              sheet for the collection, and they give the right column something
              to hold so the headline is not floating beside empty paper. */}
          <div className="lg:pt-1">
            <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">The collection</p>
            <dl className="rule-hairline mt-5 border-t">
              {[
                [roundedFloor(giftCount, 1000).toLocaleString("en-US"), "gifts"],
                [roundedFloor(platforms.length, 5).toLocaleString("en-US"), "brands"],
                [OCCASIONS.length.toLocaleString("en-US"), "occasions"],
                ["$10 to $1,500", "every budget"],
              ].map(([figure, label]) => (
                <div
                  key={label}
                  className="rule-hairline flex items-baseline justify-between gap-4 border-b py-4"
                >
                  <dt className="font-display text-2xl font-semibold tracking-[-0.02em] tabular-nums sm:text-[1.75rem]">
                    {figure}
                  </dt>
                  <dd className="text-[11px] tracking-[0.18em] text-ink-faint uppercase">
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* The launcher keeps the hero's left margin rather than the page's
            centre, so the eye runs headline, promise, button down one edge.
            Full width rather than inside the grid because launching swaps this
            for the quiz in place, and the quiz needs the whole measure.

            Also the target for the "Find their gift" button at the foot of the
            page. */}
        <div id="launch" className="mx-auto mt-14 max-w-6xl scroll-mt-28">
          <QuizLauncher align="start" />
        </div>

        {/* Proof, before the pitch.

            Nothing on this page showed a single gift, which for a gift site is
            the one thing worth showing. These are real rows at real prices from
            eight different shops, so the claim in the ledger above has something
            standing behind it by the time anyone reaches the copy below.

            A rail rather than a grid: it reads as a slice of a much bigger
            collection, where a tidy row of eight reads as the whole of it. It
            overflows deliberately and scrolls on touch. Presentational only,
            so it is hidden from the accessibility tree rather than offering
            eight links that duplicate the occasion index below. */}
        {rail.length > 0 && (
          <section
            aria-hidden
            className="rule-hairline mx-auto mt-24 max-w-6xl border-y py-7"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">
                In the collection right now
              </p>
              <p className="hidden text-xs tracking-[0.2em] text-ink-faint uppercase sm:block">
                Real things, real shops
              </p>
            </div>

            <ul className="mt-6 flex gap-6 overflow-x-auto pb-1">
              {rail.map((gift) => (
                <li key={gift.id} className="w-[9.5rem] flex-none">
                  {/* Fixed square frame. The feeds return wildly different
                      aspect ratios, and a rail that changes height per item
                      stops reading as one object. */}
                  <div className="card-surface flex aspect-square items-center justify-center overflow-hidden rounded-2xl">
                    {/* Plain img: these are 8 remote CDN hosts that change as
                        the catalogue does, and the grid elsewhere renders the
                        same way. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gift.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="font-display mt-2.5 truncate text-sm font-semibold">
                    {gift.platform}
                  </p>
                  <p className="text-xs text-ink-faint tabular-nums">
                    ${Math.round(Number(gift.price)).toLocaleString("en-US")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* An index, not a pill soup.

            Twelve identical rounded chips centred in a row is the same shape as
            every filter bar on the internet, and it made the occasions look like
            options rather than destinations. Set as a three-column index of
            Fraunces names on hairline rules, they read as a contents page, and
            the row gives each one somewhere to put its arrow. */}
        <section className="mx-auto mt-24 max-w-6xl">
          <div className="rule-hairline flex items-baseline justify-between gap-6 border-b pb-4">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
              Or browse by occasion
            </h2>
            <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">
              {OCCASIONS.length} in the list
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-14 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURED_OCCASIONS.map((occasion) => (
              <Link
                key={occasion}
                href={`/gifts/${occasionToSlug(occasion)}`}
                className="rule-hairline group flex items-baseline justify-between gap-3 border-b py-4 transition-colors hover:text-terracotta"
              >
                <span className="flex items-baseline gap-2.5">
                  {OCCASION_EMOJI[occasion] && (
                    <span aria-hidden className="text-base">
                      {OCCASION_EMOJI[occasion]}
                    </span>
                  )}
                  <span className="font-display text-lg font-semibold">{occasion}</span>
                </span>
                {/* Nudges on hover, the same gesture the launch button makes. */}
                <span
                  aria-hidden
                  className="text-sm text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-terracotta"
                >
                  →
                </span>
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

            Built on "or" pairs, each one spanning that distance in a single
            breath. The specifics are load-bearing: "the one you drew in Secret
            Santa" does more than "someone you barely know" because it is a
            situation the reader has actually been in, and the last pair names
            the two genuinely hard cases rather than describing them. The counts
            are real and come from the same query the eyebrow at the top uses.

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
              The person who knows your passwords, or the one you drew in Secret Santa. The friend
              you have had since school, or the colleague whose last day is Friday. The teenager
              who already owns everything, or the parent who insists you get them nothing.
            </p>
            <p>
              Birthdays and weddings. Diwali, Eid, Lunar New Year. A housewarming, a graduation, a
              leaving card for someone in accounts, and {OCCASIONS.length - NAMED_IN_COPY.length}{" "}
              more from around the world. Ten dollars, or fifteen hundred. Something they will keep
              for years, or something that simply needs to look like you thought about it, because
              sometimes that is the honest brief.
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

        {/* Last thing on the page, and deliberately plain. Anyone reading this
            far has one specific doubt left, and an accordion would make them
            hunt for it. Always-open text costs a little height and answers the
            question on sight. */}
        <section
          id="faq"
          className="rule-hairline mx-auto mt-20 max-w-2xl scroll-mt-24 border-t pt-14"
        >
          <p className="text-center text-xs tracking-[0.2em] text-ink-faint uppercase">
            Questions
          </p>
          <h2 className="font-display mt-4 text-center text-3xl font-semibold text-balance">
            Before you start
          </h2>

          <dl className="mt-10 space-y-8">
            {FAQS.map((entry) => (
              <div key={entry.question}>
                <dt className="font-display text-lg font-semibold text-ink">{entry.question}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-ink-soft">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
