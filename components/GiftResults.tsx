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
    confetti({
      particleCount: 90,
      spread: 80,
      origin: { y: 0.3 },
      colors: ["#7c3aed", "#ec4899", "#fb923c", "#fde047"],
    });
  }, [results.length]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold">
          {results.length > 0 ? (
            <>
              <span className="gradient-text">{results.length}</span>
              {" gift"}
              {results.length === 1 ? "" : "s"} for your {relationship.toLowerCase()}&apos;s{" "}
              {occasion.toLowerCase()} 🎉
            </>
          ) : (
            "No gifts matched 😕"
          )}
        </h2>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full border-2 border-black/10 px-4 py-1.5 text-sm font-semibold transition hover:border-brand-pink/50 dark:border-white/10"
        >
          ↺ Start over
        </button>
      </div>

      {results.length > 0 && (
        <p className="mb-6 text-xs text-neutral-400">
          Links go directly to the seller. We don&apos;t earn anything from your purchase.
        </p>
      )}

      {results.length === 0 ? (
        <div className="rounded-2xl border border-black/5 bg-white/70 p-6 text-sm text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
          {candidateCount > 0 ? (
            <p>
              We found {candidateCount} gift{candidateCount === 1 ? "" : "s"} for this occasion and
              budget, but none that genuinely fit those interests — so we&apos;d rather show you
              nothing than a bad guess. Try picking a few more interests, or widen the budget.
            </p>
          ) : (
            <p>
              Nothing in our catalog fits that occasion, age and budget combination yet. Try raising
              the budget or choosing a different occasion.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((gift, index) => (
              <motion.div
                key={gift.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                // Stagger only within a page, and cap it — otherwise the last
                // card of a long list waits seconds before appearing.
                transition={{ delay: Math.min((index % PAGE_SIZE) * 0.03, 0.4), duration: 0.3 }}
              >
                <GiftCard gift={gift} />
              </motion.div>
            ))}
          </div>

          {remaining > 0 && (
            <div className="mt-8 text-center">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="btn-gradient rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-pink/25"
              >
                Show {Math.min(remaining, PAGE_SIZE)} more
              </motion.button>
              <p className="mt-2 text-xs text-neutral-500">
                Showing {visible.length} of {results.length}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
