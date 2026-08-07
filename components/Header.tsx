import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/70 backdrop-blur-lg dark:border-white/10 dark:bg-[#12091f]/70">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🎁</span>
          <span className="font-display gradient-text text-lg font-bold tracking-tight">
            GiftFinder
          </span>
        </Link>
      </div>
    </header>
  );
}
