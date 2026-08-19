"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import { HOME_RESET_EVENT } from "@/lib/home-reset";
import type { GiftRecommendation, RecommendRequestBody } from "@/lib/types";
import { GiftCard } from "./GiftCard";
import { GiftDetail } from "./GiftDetail";

/** Cards revealed per page. Deep enough that the grid reads as a real spread. */
const PAGE_SIZE = 36;

/**
 * Once results are on screen the quiz is finished, so the useful next move is a
 * fresh start for a different person — not question one with the previous
 * answers cleared. This is the same reset the header wordmark broadcasts:
 * QuizLauncher collapses to the landing page, and unmounting the quiz is what
 * discards the answers.
 */
function goHome() {
  window.dispatchEvent(new Event(HOME_RESET_EVENT));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}

export function GiftResults({
  results,
  answers,
  candidateCount,
}: {
  results: GiftRecommendation[];
  /** The quiz answers, kept so "more like this" can honour the same constraints. */
  answers: RecommendRequestBody;
  candidateCount: number;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { relationship, occasion } = answers;

  // Brands actually present in this result set, most-stocked first. Derived
  // rather than taken from a fixed list, so a brand only ever appears as a
  // filter when there is something behind it to show.
  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const gift of results) counts.set(gift.platform, (counts.get(gift.platform) ?? 0) + 1);
    return [...counts.entries()].sort(
      ([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB),
    );
  }, [results]);

  // No selection means no filter, rather than an empty page.
  const filtered = useMemo(
    () =>
      selectedBrands.length === 0
        ? results
        : results.filter((gift) => selectedBrands.includes(gift.platform)),
    [results, selectedBrands],
  );

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  // A fresh set of results should start from the first page with no filter.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setSelectedBrands([]);
    setSelectedId(null);
  }, [results]);

  // Narrowing the brands should also rewind the reveal — otherwise a filter
  // applied deep in a long scroll paints every remaining match at once.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedBrands]);

  function toggleBrand(brand: string) {
    setSelectedBrands((current) =>
      current.includes(brand) ? current.filter((b) => b !== brand) : [...current, brand],
    );
  }

  // Load the next page as the bottom of the grid comes into view, so browsing
  // is one continuous scroll rather than a click every screenful. The button
  // below stays for anyone who would rather advance deliberately, and for
  // keyboard users who never scroll the sentinel into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || remaining <= 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length));
        }
      },
      // Start fetching slightly before the sentinel is actually on screen.
      { rootMargin: "400px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [remaining, filtered.length]);

  useEffect(() => {
    if (results.length === 0) return;
    // Restrained and in-palette — a small flourish, not a party popper.
    confetti({
      particleCount: 55,
      spread: 62,
      startVelocity: 32,
      ticks: 140,
      scalar: 0.85,
      origin: { y: 0.28 },
      // Saturated enough to stay visible against the ivory ground — the pale
      // champagne tones used on the dark build disappeared here.
      colors: ["#8c6829", "#b8944a", "#4a5480", "#1b1c24"],
    });
  }, [results.length]);

  const selectedGift = selectedId
    ? (results.find((gift) => gift.id === selectedId) ?? null)
    : null;

  // Stable identity, because the detail overlay keys its one fetch per product
  // off this and a fresh array every render would refire it mid-flight.
  const resultIds = useMemo(() => results.map((gift) => gift.id), [results]);

  return (
    <div className="mx-auto max-w-5xl px-4">
      <header className="rule-hairline mb-8 border-b pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.18em] text-ink-faint uppercase">
              {occasion} · for your {relationship.toLowerCase()}
            </p>
            <h2 className="font-display mt-2 text-3xl leading-tight font-semibold text-balance sm:text-4xl">
              {results.length > 0 ? (
                <>
                  <span className="text-terracotta">{filtered.length}</span> gift
                  {filtered.length === 1 ? "" : "s"} worth giving
                </>
              ) : (
                "Nothing quite fits yet"
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={goHome}
            className="rule-hairline rounded-full border px-5 py-2.5 text-sm text-ink transition-colors hover:border-terracotta hover:text-terracotta"
          >
            Search for someone else
          </button>
        </div>

        {results.length > 0 && (
          <p className="mt-4 text-xs text-ink-faint">
            Tap any gift to see it up close, with the nearest things to it. Links go straight to
            the seller. We earn nothing from your purchase.
          </p>
        )}
      </header>

      {/* Only worth showing when there is a choice to make — a single brand
          would render a filter that can only narrow to what is already there. */}
      {brands.length > 1 && (
        <div className="mb-8">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <p className="text-xs tracking-[0.18em] text-ink-faint uppercase">
              {selectedBrands.length === 0
                ? "Shop from"
                : `Shopping from ${selectedBrands.length} of ${brands.length}`}
            </p>
            {selectedBrands.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedBrands([])}
                className="text-xs text-ink-soft transition-colors hover:text-terracotta"
              >
                Show all
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {brands.map(([brand, count]) => (
              <motion.button
                key={brand}
                type="button"
                onClick={() => toggleBrand(brand)}
                data-selected={selectedBrands.includes(brand)}
                aria-pressed={selectedBrands.includes(brand)}
                whileTap={{ scale: 0.96 }}
                className="chip rounded-full px-4 py-2 text-sm"
              >
                {brand}
                <span className="ml-1.5 text-xs tabular-nums opacity-60">{count}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 ? (
        <div className="card-surface rounded-2xl p-8 text-sm leading-relaxed text-ink-soft">
          {candidateCount > 0 ? (
            <p>
              We found {candidateCount} gift{candidateCount === 1 ? "" : "s"} for this occasion and
              budget, but none that genuinely match those interests. We&apos;d rather show you
              nothing than a bad guess. Try adding a few more interests, or widening the budget.
            </p>
          ) : (
            <p>
              Nothing in the collection fits that occasion, age and budget together yet. Try raising
              the budget, or choosing a nearby occasion.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((gift, index) => (
              <motion.div
                key={gift.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                // Stagger only within a page, and cap it — otherwise the last
                // card of a long list waits seconds before appearing.
                transition={{ delay: Math.min((index % PAGE_SIZE) * 0.025, 0.35), duration: 0.32 }}
                // h-full so every card stretches to its grid row, keeping the
                // "View on…" buttons aligned when titles wrap to different heights.
                className="h-full"
              >
                <GiftCard gift={gift} onSelect={() => setSelectedId(gift.id)} />
              </motion.div>
            ))}
          </div>

          {/* Tripwire for the observer above; sits above the button so the next
              page is already loading by the time the button would be reached. */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />

          {remaining > 0 && (
            <div className="mt-12 flex flex-col items-center gap-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length))
                }
                className="btn-primary rounded-full px-8 py-3 text-sm font-medium"
              >
                Show {Math.min(remaining, PAGE_SIZE)} more
              </motion.button>
              <p className="text-xs text-ink-faint tabular-nums">
                {visible.length} of {filtered.length}
              </p>
            </div>
          )}

          {remaining === 0 && filtered.length > PAGE_SIZE && (
            <p className="mt-12 text-center text-xs tracking-[0.14em] text-ink-faint uppercase">
              That&apos;s all {filtered.length}
              {selectedBrands.length > 0
                ? " · show all brands for more"
                : " · pick a different budget or occasion for more"}
            </p>
          )}
        </>
      )}

      <AnimatePresence>
        {selectedGift && (
          <GiftDetail
            key={selectedGift.id}
            gift={selectedGift}
            answers={answers}
            excludeIds={resultIds}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
