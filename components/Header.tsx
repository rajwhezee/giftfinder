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
          aria-label="Gift Finder, back to the start"
        >
          {/* aria-hidden because the link's aria-label above already carries the
              readable name — the dotless ı would otherwise be announced and
              copied as "Fınder". See .wordmark-i in globals.css. */}
          <span
            aria-hidden
            className="font-display text-xl font-semibold tracking-tight text-ink"
          >
            Gift
            <span className="text-terracotta">
              F
              <span className="wordmark-i">
                &#x131;
                <svg viewBox="0 0 20 20" fill="none" className="wordmark-lens">
                  <circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="2.6" />
                  <path
                    d="M12.3 12.3 17 17"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              nder
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Only off the home page. The wordmark already goes home, but a
              logo is a convention people have to know, and this is the same
              journey spelled out. On "/" it would be a button that does
              nothing, so it is not rendered there. */}
          {pathname !== "/" && (
            <Link
              href="/"
              className="rule-hairline rounded-full border px-3.5 py-1.5 text-[11px] tracking-[0.16em] text-ink-soft uppercase transition-colors hover:border-terracotta hover:text-terracotta"
            >
              <span aria-hidden className="mr-1">
                ←
              </span>
              Home
            </Link>
          )}
          <p className="hidden text-xs tracking-[0.18em] text-ink-faint uppercase md:block">
            Any occasion · Any culture
          </p>
          {/* On "/" this is a same-page jump; from an occasion page it
              navigates home and lands on the section.

              Given a border because it sat in the same grey uppercase as the
              "Any occasion · Any culture" line beside it, which is decoration
              and not a link — so the one control in the header read as more
              decoration. The outline is what says "this does something".
              Deliberately small and still ink-soft: it is for the minority who
              want more before they commit, and it should not compete with the
              button the page is actually built around. */}
          <Link
            href="/#about"
            className="rule-hairline rounded-full border px-3.5 py-1.5 text-[11px] tracking-[0.16em] text-ink-soft uppercase transition-colors hover:border-terracotta hover:text-terracotta"
          >
            What is this?
          </Link>
        </div>
      </div>
    </header>
  );
}
