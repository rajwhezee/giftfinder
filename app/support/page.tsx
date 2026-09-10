import type { Metadata } from "next";
import Link from "next/link";
import { FEEDBACK_PATH, SUPPORT_EMAIL } from "@/lib/feedback";
import { jsonLdScript } from "@/lib/json-ld";

const SITE = "https://thegiftfinder.net";

export const metadata: Metadata = {
  title: "Contact and support | Gift Finder",
  description:
    "How to reach Gift Finder: email us, report a broken listing, or ask about a gift result.",
  alternates: { canonical: `${SITE}/support` },
};

/**
 * The contact page.
 *
 * Indexed, unlike /feedback, and not only for people: a site that links out to
 * other retailers and holds itself out as unsponsored should be reachable, and
 * a real contact route is one of the few things a new domain can offer as
 * evidence that somebody is behind it.
 */
export default function SupportPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact and support",
    url: `${SITE}/support`,
    mainEntity: {
      "@type": "Organization",
      name: "Gift Finder",
      url: SITE,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SUPPORT_EMAIL,
        availableLanguage: "English",
      },
    },
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <nav className="text-xs tracking-[0.14em] text-ink-faint uppercase">
        <Link href="/" className="transition-colors hover:text-terracotta">
          Gift Finder
        </Link>
        <span className="mx-2">/</span>
        <span>Support</span>
      </nav>

      <h1 className="font-display mt-6 text-4xl font-semibold">Contact and support</h1>

      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
        Gift Finder is a small personal project rather than a company, so there is no queue and no
        ticket number. One person reads everything that arrives, usually within a few days.
      </p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-ink-soft">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink">Email</h2>
          <p className="mt-2">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-display text-xl text-terracotta underline underline-offset-4 hover:text-terracotta-deep"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-3">
            Best for anything that needs a reply: a question about a listing, a privacy request, or
            something you would rather not put in a form.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">Suggestions</h2>
          <p className="mt-2">
            If you do not need an answer and just want to tell us what would have been better, the{" "}
            <Link href={FEEDBACK_PATH} className="text-terracotta underline underline-offset-4 hover:text-terracotta-deep">
              feedback form
            </Link>{" "}
            is quicker. It goes to the same place and you can leave it anonymously.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            A price or a photo is wrong
          </h2>
          <p className="mt-2">
            Prices, titles and photos come from each retailer and are refreshed daily, so a listing
            can be out of date between refreshes, and a product can sell out or be withdrawn
            entirely. The retailer&apos;s own page is always the authority. Tell us and the row gets
            fixed or removed.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            What we cannot help with
          </h2>
          <p className="mt-2">
            We do not sell anything. Every result links to the retailer, and your order, payment,
            delivery and returns are between you and them, so we have no access to your order and
            cannot change or cancel it. For anything about a purchase, contact the shop you bought
            from. See{" "}
            <Link href="/disclosure" className="text-terracotta underline underline-offset-4 hover:text-terracotta-deep">
              how this site works
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
