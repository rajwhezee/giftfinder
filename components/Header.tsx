import Link from "next/link";

export function Header() {
  return (
    <header className="rule-hairline sticky top-0 z-50 border-b bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="group flex items-baseline gap-2">
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
