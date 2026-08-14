import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Gift Finder",
  description: "How Gift Finder handles your information.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:py-20">
      <h1 className="font-display text-4xl font-semibold">Privacy Policy</h1>
      <p className="mt-3 text-xs tracking-[0.18em] text-ink-faint uppercase">Last updated: July 2026</p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-ink-soft">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            What we collect
          </h2>
          <p className="mt-2">
            Gift Finder&apos;s quiz asks about the recipient&apos;s relationship to you, age,
            occasion, interests, and your budget. These answers are sent to our server only to
            look up matching gifts and are not stored or linked to your identity — there are no
            user accounts, and we don&apos;t save your quiz submissions.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            Server and hosting logs
          </h2>
          <p className="mt-2">
            Like most websites, our hosting and database providers automatically log standard
            technical information (such as IP address and request timestamps) for security and
            reliability purposes. We don&apos;t use this data for tracking or advertising.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            Third-party links
          </h2>
          <p className="mt-2">
            Gift results link out to retailers such as Etsy and Walmart. Once you click through,
            you&apos;re subject to that retailer&apos;s own privacy policy — we don&apos;t control
            or receive any personal information from those sites. See{" "}
            <Link href="/disclosure" className="text-terracotta underline underline-offset-4 hover:text-terracotta-deep">
              how this site works
            </Link>{" "}
            for more on those links.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            Changes to this policy
          </h2>
          <p className="mt-2">
            If we add features that change how data is handled (such as accounts or analytics),
            we&apos;ll update this page.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">
            Contact
          </h2>
          <p className="mt-2">
            Questions about this policy can be sent to{" "}
            <a href="mailto:hello@example.com" className="text-terracotta underline underline-offset-4 hover:text-terracotta-deep">
              hello@example.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
