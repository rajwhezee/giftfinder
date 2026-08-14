"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import type { GiftRecommendation } from "@/lib/types";
import { GiftCard } from "./GiftCard";

const PAGE_SIZE = 24;

export function GiftResults({
  results,
  relationship,
  occasion,
  candidateCount,
  onRestart,
}: {
  results: GiftRecommendation[];
  relationship: string;
  occasion: string;
  candidateCount: number;
  onRestart: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = results.slice(0, visibleCount);
  const remaining = results.length - visible.length;

  // A fresh set of results should always start from the first page.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [results]);

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
                  <span className="text-terracotta">{results.length}</span> gift
                  {results.length === 1 ? "" : "s"} worth giving
                </>
              ) : (
                "Nothing quite fits — yet"
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="rule-hairline rounded-full border px-5 py-2.5 text-sm text-ink transition-colors hover:border-terracotta hover:text-terracotta"
          >
            Start over
          </button>
        </div>

        {results.length > 0 && (
          <p className="mt-4 text-xs text-ink-faint">
            Links go straight to the seller. We earn nothing from your purchase.
          </p>
        )}
      </header>

      {results.length === 0 ? (
        <div className="card-surface rounded-2xl p-8 text-sm leading-relaxed text-ink-soft">
          {candidateCount > 0 ? (
            <p>
              We found {candidateCount} gift{candidateCount === 1 ? "" : "s"} for this occasion and
              budget, but none that genuinely match those interests — and we&apos;d rather show you
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
                <GiftCard gift={gift} />
              </motion.div>
            ))}
          </div>

          {remaining > 0 && (
            <div className="mt-12 flex flex-col items-center gap-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="btn-primary rounded-full px-8 py-3 text-sm font-medium"
              >
                Show {Math.min(remaining, PAGE_SIZE)} more
              </motion.button>
              <p className="text-xs text-ink-faint tabular-nums">
                {visible.length} of {results.length}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
