"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import type { GiftRecommendation, RecommendRequestBody, SimilarResponse } from "@/lib/types";
import { brandLabel } from "@/lib/brand-from-title";
import { GiftCard } from "./GiftCard";

/** Placeholder cards while the similar grid loads. */
const SIMILAR_SKELETONS = 4;

/**
 * The product a shopper picked out, shown large, with the nearest things to it
 * underneath.
 *
 * An overlay rather than a route. The results only exist in this tab's memory —
 * they were computed from answers that are never written to the URL — so
 * navigating to a product page and back would either lose the grid or have to
 * re-run the whole quiz to rebuild it. Opening in place keeps the shopper's
 * place on the page they came from, which is the thing they would actually
 * miss.
 *
 * Picking a similar product pushes it on top rather than replacing the view, so
 * "that one's close, but…" can be followed as far as it goes and still walked
 * back one step at a time.
 */
export function GiftDetail({
  gift,
  answers,
  excludeIds,
  onClose,
}: {
  gift: GiftRecommendation;
  answers: RecommendRequestBody;
  /** Ids already in the grid behind this, so the strip offers new things. */
  excludeIds: string[];
  onClose: () => void;
}) {
  const [stack, setStack] = useState<GiftRecommendation[]>([gift]);
  const [similar, setSimilar] = useState<Record<string, GiftRecommendation[]>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = stack[stack.length - 1];
  const previous = stack.length > 1 ? stack[stack.length - 2] : null;
  const results = similar[current.id];

  // A new anchor arriving from the grid is a new subject, not a step deeper.
  useEffect(() => {
    setStack([gift]);
  }, [gift]);

  const load = useCallback(
    (giftId: string) => {
      setStatus("loading");
      return fetch("/api/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, giftId, excludeIds }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Request failed");
          return res.json() as Promise<SimilarResponse>;
        })
        .then((data) => {
          setSimilar((cache) => ({ ...cache, [giftId]: data.results }));
          setStatus("idle");
        })
        .catch(() => setStatus("error"));
    },
    [answers, excludeIds],
  );

  // One request per product, cached for as long as the overlay is open: going
  // back up the stack should be instant, and comparing two products means
  // moving between them repeatedly.
  useEffect(() => {
    if (similar[current.id]) return;
    load(current.id);
  }, [current.id, similar, load]);

  // Escape closes, and the page behind must not scroll under the overlay —
  // on a phone that is the difference between a dialog and a stuck page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Whatever opened this gets the keyboard back when it closes, or focus
    // falls to the top of the document and the shopper loses their place.
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  // Going deeper should start at the top of the new product, not halfway down
  // the previous one's similar grid.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [current.id]);

  const approximate = current.originalCurrency !== "USD";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-detail-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        // The backdrop closes on click; the panel must not pass its own clicks
        // up to it.
        onClick={(event) => event.stopPropagation()}
        className="card-surface flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
      >
        <div className="rule-hairline flex items-center justify-between gap-4 border-b px-5 py-3.5 sm:px-6">
          {previous ? (
            <button
              type="button"
              onClick={() => setStack((current) => current.slice(0, -1))}
              className="inline-flex items-center gap-1.5 text-xs tracking-[0.14em] text-ink-soft uppercase transition-colors hover:text-terracotta"
            >
              <span aria-hidden>←</span>
              Back
            </button>
          ) : (
            <p className="text-xs tracking-[0.18em] text-ink-faint uppercase">The gift</p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rule-hairline inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
          >
            <span aria-hidden>✕</span>
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div ref={scrollRef} className="overflow-y-auto px-5 py-6 sm:px-6 sm:py-7">
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
            {/* Capped on a phone: at a full 4:5 the photo alone filled the
                sheet and the price and the seller button both sat below the
                fold, so the product read as unbuyable until you scrolled. */}
            <div className="relative aspect-[4/5] max-h-[46vh] w-full overflow-hidden rounded-2xl bg-paper sm:max-h-none">
              <Image
                src={current.imageUrl}
                alt={current.name}
                fill
                sizes="(min-width: 640px) 45vw, 100vw"
                className="object-cover"
                priority
              />
            </div>

            <div className="flex flex-col">
              <p className="text-[11px] tracking-[0.14em] text-ink-faint uppercase">
                {brandLabel(current)}
              </p>
              <h2
                id="gift-detail-title"
                className="font-display mt-2 text-xl leading-snug font-semibold text-balance sm:text-3xl"
              >
                {current.name}
              </h2>

              <p className="font-display mt-4 text-3xl font-semibold text-ink tabular-nums">
                {approximate && (
                  <span
                    className="text-ink-faint"
                    title={`Converted from ${current.originalCurrency}. The seller charges in their own currency.`}
                  >
                    ~
                  </span>
                )}
                ${current.price.toFixed(2)}
              </p>

              <a
                href={current.productUrl}
                target="_blank"
                rel="nofollow noopener"
                className="btn-primary mt-6 inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium"
              >
                View on {current.platform}
                <span aria-hidden>→</span>
              </a>

              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                Goes straight to the seller. We earn nothing from your purchase, so nothing here is
                ranked because someone paid for it.
              </p>
            </div>
          </div>

          <div className="rule-hairline mt-8 border-t pt-6">
            <p className="text-xs tracking-[0.18em] text-ink-faint uppercase">More like this</p>
            <p className="mt-1.5 text-sm text-ink-soft">
              Closest to it in the collection, still inside what you asked for.
            </p>

            <div className="mt-5">
              {status === "loading" && !results && (
                <>
                  <div aria-hidden className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: SIMILAR_SKELETONS }).map((_, slot) => (
                      <div key={slot} className="aspect-[4/5] animate-pulse rounded-2xl bg-paper" />
                    ))}
                  </div>
                  <p role="status" className="sr-only">
                    Finding similar gifts
                  </p>
                </>
              )}

              {status === "error" && !results && (
                <p className="text-sm text-ink-soft">
                  We couldn&apos;t reach the collection just then.{" "}
                  <button
                    type="button"
                    onClick={() => load(current.id)}
                    className="text-terracotta underline underline-offset-2"
                  >
                    Try again
                  </button>
                </p>
              )}

              {results && results.length === 0 && (
                <p className="text-sm leading-relaxed text-ink-soft">
                  Nothing else in the collection sits close to this one. Widening the budget
                  usually turns up more.
                </p>
              )}

              {results && results.length > 0 && (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                  {results.map((match) => (
                    <div key={match.id} className="h-full">
                      <GiftCard gift={match} onSelect={() => setStack((s) => [...s, match])} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
