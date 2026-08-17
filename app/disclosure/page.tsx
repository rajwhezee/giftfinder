import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How This Site Works | Gift Finder",
  description: "How Gift Finder chooses what to recommend, and how it makes money.",
};

export default function DisclosurePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:py-20">
      <h1 className="font-display text-4xl font-semibold">How This Site Works</h1>
      <p className="mt-3 text-xs tracking-[0.18em] text-ink-faint uppercase">Last updated: July 2026</p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-ink-soft">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            We don&apos;t make money from your purchases
          </h2>
          <p className="mt-2">
            Gift Finder is a personal, non-commercial project. Every &quot;View on [platform]&quot;
            link goes directly to the retailer&apos;s product page. We are not part of any affiliate
            programme, we earn no commission, and we receive nothing if you buy something.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            How recommendations are chosen
          </h2>
          <p className="mt-2">
            Results are based only on your quiz answers. We match the occasion, the recipient&apos;s
            age and interests, and your budget against our catalog, then rank by how well each gift
            fits. Nobody can pay to appear in your results or to rank higher in them.
          </p>
          <p className="mt-2">
            If nothing in the catalog genuinely fits what you told us, we&apos;ll say so rather than
            filling the page with weak guesses.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            Where the products come from
          </h2>
          <p className="mt-2">
            Product details, including titles, prices, images and links, come from public listings on
            retailers such as Etsy and Walmart, including via Etsy&apos;s public API. Prices and
            availability can change at any time, so always check the retailer&apos;s page before
            buying. We don&apos;t sell anything ourselves and we aren&apos;t affiliated with these
            retailers.
          </p>
        </section>
      </div>
    </main>
  );
}
