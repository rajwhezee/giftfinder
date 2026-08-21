import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import { Header } from "@/components/Header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Fraunces is the voice of the design: a soft, slightly quirky old-style serif.
// `WONK` adds the characterful angled terminals that keep it from reading as a
// stock system serif.
// Loaded as a variable font (no explicit `weight`) — next/font rejects `axes`
// alongside a fixed weight list, and the variable range covers 400–700 anyway.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  // Makes relative OG/canonical URLs resolve against the real domain rather
  // than the deployment's rotating *.vercel.app hostname.
  metadataBase: new URL("https://thegiftfinder.net"),
  title: "Gift Finder | Thoughtful gifts for any occasion",
  description:
    "Answer a few questions and find a gift worth giving, for any occasion and any culture.",
  openGraph: {
    type: "website",
    url: "https://thegiftfinder.net",
    siteName: "Gift Finder",
    title: "Gift Finder | Thoughtful gifts for any occasion",
    description:
      "Answer a few questions and find a gift worth giving, for any occasion and any culture.",
  },
  // The image itself comes from app/twitter-image.tsx; this is only the card
  // size. Without it the default is `summary`, which crops the share card into
  // a thumbnail beside the text rather than showing it.
  twitter: {
    card: "summary_large_image",
    title: "Gift Finder | Thoughtful gifts for any occasion",
    description:
      "Answer a few questions and find a gift worth giving, for any occasion and any culture.",
  },
};

// Matches --paper so mobile browser chrome blends into the page.
export const viewport = {
  themeColor: "#faf7f0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="paper-grain flex min-h-full flex-col">
        {/* First thing in the tab order, invisible until focused. Without it a
            keyboard or screen-reader user walks the wordmark, the Home link and
            "What is this?" before reaching the page on every route. */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        {/* A div, not a <main>: every page supplies its own, and two main
            landmarks is worse for a screen reader than the wrapper being
            generic. This only needs to be a focus target. */}
        <div id="main" tabIndex={-1} className="relative z-10 flex-1">
          {children}
        </div>
        <footer className="rule-hairline relative z-10 border-t px-4 py-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center">
            <Link
              href="/"
              className="font-display text-base text-ink transition-colors hover:text-terracotta"
            >
              Gift Finder
            </Link>
            <p className="text-xs text-ink-faint">
              Handpicked from independent makers and trusted shops. We never take a cut.
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-ink-soft">
              <Link href="/" className="transition-colors hover:text-terracotta">
                Home
              </Link>
              <span aria-hidden className="text-ink-faint">
                ·
              </span>
              <Link href="/privacy" className="transition-colors hover:text-terracotta">
                Privacy
              </Link>
              <span aria-hidden className="text-ink-faint">
                ·
              </span>
              <Link href="/disclosure" className="transition-colors hover:text-terracotta">
                How this site works
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
