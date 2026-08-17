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
        <Header />
        <div className="relative z-10 flex-1">{children}</div>
        <footer className="rule-hairline relative z-10 border-t px-4 py-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center">
            <p className="font-display text-base text-ink">Gift Finder</p>
            <p className="text-xs text-ink-faint">
              Handpicked from independent makers and trusted shops. We never take a cut.
            </p>
            <div className="mt-1 flex items-center gap-4 text-xs text-ink-soft">
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
