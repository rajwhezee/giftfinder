"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOME_RESET_EVENT } from "@/lib/home-reset";

export function Header() {
  const pathname = usePathname();

  function handleWordmarkClick(event: React.MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle "open in new tab" and friends untouched.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // From any other route the normal navigation already mounts a fresh page.
    if (pathname !== "/") return;

    event.preventDefault();
    window.dispatchEvent(new Event(HOME_RESET_EVENT));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <header className="rule-hairline sticky top-0 z-50 border-b bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          onClick={handleWordmarkClick}
          className="group flex items-baseline gap-2"
          aria-label="Gift Finder — back to the start"
        >
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            Gift<span className="text-terracotta">Finder</span>
          </span>
        </Link>
        <p className="hidden text-xs tracking-[0.18em] text-ink-faint uppercase sm:block">
          Any occasion · Any culture
        </p>
      </div>
    </header>
  );
}
