import type { Metadata } from "next";
import { Fredoka, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Header } from "@/components/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Gift Finder",
  description: "Answer a few questions and find the perfect gift.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-black/5 px-4 py-6 text-center text-xs text-neutral-500 dark:border-white/10">
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/disclosure" className="underline underline-offset-4">
            How This Site Works
          </Link>
        </footer>
      </body>
    </html>
  );
}
