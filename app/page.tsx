import { GiftQuiz } from "@/components/GiftQuiz";

export default function Home() {
  return (
    <main className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-purple/30 blur-3xl" />
        <div className="animate-float-slow absolute top-10 -right-24 h-80 w-80 rounded-full bg-brand-orange/30 blur-3xl" />
        <div className="animate-float absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-brand-pink/20 blur-3xl" />
      </div>

      <div className="relative px-4 py-12 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/70 px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
            🎁 1,200+ real gifts · every culture, every celebration
          </span>
          <h1 className="font-display mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
            Find the <span className="gradient-text">perfect gift</span>
            <br />
            in 30 seconds
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-neutral-600 sm:text-lg dark:text-neutral-400">
            Four quick questions. Zero endless scrolling. We&apos;ll match you with gifts real
            people would actually want.
          </p>
        </div>

        <div className="mt-12">
          <GiftQuiz />
        </div>
      </div>
    </main>
  );
}
