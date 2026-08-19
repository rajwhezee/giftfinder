import Image from "next/image";
import { motion } from "motion/react";
import type { GiftRecommendation } from "@/lib/types";

export function GiftCard({
  gift,
  onSelect,
}: {
  gift: GiftRecommendation;
  /** Opens the detail view. Omitted where the card is already inside one. */
  onSelect?: () => void;
}) {
  const approximate = gift.originalCurrency !== "USD";

  return (
    <motion.article
      // The whole card moves, price and title included, rather than zooming the
      // image inside a card that stays put. Lifting one part of an object and
      // leaving the rest reads as the picture coming loose from its frame.
      //
      // hover:z-10 because a scaled card overlaps its neighbours, and without a
      // stacking order it slides *under* the one to its right.
      whileHover={{ y: -8, scale: 1.03 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="card-surface card-hover group relative z-0 flex h-full flex-col overflow-hidden rounded-2xl hover:z-10"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-paper">
        <Image
          src={gift.imageUrl}
          alt={gift.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover"
        />
        {gift.matchScore > 1 && (
          <span className="absolute top-3 left-3 z-20 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium tracking-wide text-plum backdrop-blur-sm">
            Strong match
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1">
          <p className="text-[11px] tracking-[0.14em] text-ink-faint uppercase">{gift.platform}</p>
          <h3 className="mt-1.5 line-clamp-2 text-sm leading-snug text-ink">{gift.name}</h3>
        </div>

        <p className="font-display text-xl font-semibold text-ink tabular-nums">
          {approximate && (
            <span
              className="text-ink-faint"
              title={`Converted from ${gift.originalCurrency}. The seller charges in their own currency.`}
            >
              ~
            </span>
          )}
          ${gift.price.toFixed(2)}
        </p>

        {/* z-20 keeps the merchant link above the whole-card button below, so
            the one explicit action on the card still beats the ambient one. */}
        <a
          href={gift.productUrl}
          target="_blank"
          rel="nofollow noopener"
          className="rule-hairline relative z-20 mt-auto inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-sm text-ink transition-colors hover:border-terracotta hover:text-terracotta"
        >
          View on {gift.platform}
          <span aria-hidden>→</span>
        </a>
      </div>

      {/* The whole card opens the detail view. Done as a real button covering
          the card rather than an onClick on the article: it lands in the tab
          order, answers the keyboard, and announces itself — none of which a
          clickable <article> does. It sits under the merchant link in z-order
          and carries no visible chrome of its own, so the card still reads as
          one object rather than as two stacked controls. */}
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none"
        >
          <span className="sr-only">See {gift.name} and similar gifts</span>
        </button>
      )}
    </motion.article>
  );
}
