import Image from "next/image";
import { buildAffiliateUrl } from "@/lib/affiliate";

/**
 * Server-rendered gift card for the occasion landing pages.
 *
 * Deliberately not the interactive GiftCard: that one pulls in `motion`, which
 * forces the whole subtree to be a client component. Landing pages exist to be
 * crawled, so their product markup has to be in the server-rendered HTML.
 */
export function StaticGiftCard({
  gift,
}: {
  gift: {
    id: string;
    name: string;
    price: number;
    originalCurrency: string;
    imageUrl: string;
    affiliateUrl: string;
    platform: string;
  };
}) {
  const href = buildAffiliateUrl(gift);
  const approximate = gift.originalCurrency !== "USD";

  return (
    <article className="card-surface group flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-paper">
        <Image
          src={gift.imageUrl}
          alt={gift.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
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
              title={`Converted from ${gift.originalCurrency} — the seller charges in their own currency`}
            >
              ~
            </span>
          )}
          ${gift.price.toFixed(2)}
        </p>

        <a
          href={href}
          target="_blank"
          rel="nofollow noopener"
          className="rule-hairline mt-auto inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-sm text-ink transition-colors hover:border-terracotta hover:text-terracotta"
        >
          View on {gift.platform}
          <span aria-hidden>→</span>
        </a>
      </div>
    </article>
  );
}
