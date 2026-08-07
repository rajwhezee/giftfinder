import Image from "next/image";
import { motion } from "motion/react";
import type { GiftRecommendation } from "@/lib/types";
import { buildAffiliateUrl } from "@/lib/affiliate";

const PLATFORM_BADGE: Record<string, string> = {
  amazon: "bg-[#232f3e] text-[#ff9900]",
  etsy: "bg-[#f1641e] text-white",
  walmart: "bg-[#0071ce] text-white",
  ebay: "bg-neutral-900 text-white",
};

export function GiftCard({ gift }: { gift: GiftRecommendation }) {
  const affiliateUrl = buildAffiliateUrl(gift);
  const badgeClass = PLATFORM_BADGE[gift.platform.toLowerCase()] ?? "gradient-bg text-white";

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition-shadow hover:shadow-xl hover:shadow-purple-500/10 dark:border-white/10 dark:bg-neutral-900"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        <Image
          src={gift.imageUrl}
          alt={gift.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-300 hover:scale-105"
        />
        <span
          className={`absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass}`}
        >
          {gift.platform}
        </span>
        {gift.matchScore > 0 && (
          <span className="absolute top-2 right-2 rounded-full bg-white/90 px-2 py-1 text-xs font-bold text-brand-purple shadow-sm dark:bg-black/70">
            ✨ {gift.matchScore} match{gift.matchScore === 1 ? "" : "es"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold">{gift.name}</h3>
        <p className="font-display gradient-text text-xl font-bold">
          {gift.originalCurrency !== "USD" && (
            <span title={`Converted from ${gift.originalCurrency} — the seller's page shows their own currency`}>
              ~
            </span>
          )}
          ${gift.price.toFixed(2)}
        </p>
        <a
          href={affiliateUrl}
          target="_blank"
          rel="nofollow noopener"
          className="btn-gradient mt-auto inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-pink/20"
        >
          View on {gift.platform}
        </a>
      </div>
    </motion.div>
  );
}
