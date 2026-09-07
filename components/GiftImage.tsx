"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/**
 * A product photo that degrades to a drawn placeholder instead of the browser's
 * broken-image glyph.
 *
 * Every image on the site is hotlinked from the merchant's own CDN — Shopify,
 * Etsy, eBay — and those URLs rot on the merchant's schedule, not ours. A swept
 * check of all 29,135 rows on 2026-09-07 found 75 already answering 404, all of
 * them Shopify storefronts that had re-uploaded or delisted the photo since the
 * import. Refreshing the catalogue fixes today's casualties and does nothing
 * about next month's, so the fallback lives here rather than only in the data.
 *
 * `failedSrc` rather than a boolean: the detail overlay swaps `src` in place as
 * the shopper moves between gifts, and a boolean would keep showing the
 * placeholder for every later gift once any one of them had failed.
 *
 * Client component, but only this leaf is — the card's title, price and link
 * stay server-rendered. Client components are still server-rendered on first
 * paint, so the <img> remains in the crawled HTML of the occasion pages.
 */
export function GiftImage({ src, alt, className, ...rest }: ImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc !== null && failedSrc === src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper"
      >
        {/* The wordmark's gift, without the lens: there is nothing to look at
            here, so the magnifier would be a joke at the shopper's expense. */}
        <svg viewBox="0 0 40 40" className="w-10 opacity-45" aria-hidden="true">
          <g fill="var(--terracotta)">
            <circle cx="16.4" cy="10.4" r="2.6" />
            <circle cx="23.6" cy="10.4" r="2.6" />
            <rect x="8" y="13" width="24" height="5.4" rx="1" />
            <rect x="10.4" y="19.6" width="19.2" height="12.4" rx="1" />
          </g>
          <rect x="18.9" y="13" width="2.2" height="19" fill="var(--paper)" />
        </svg>
        <span className="text-[11px] tracking-[0.14em] text-ink-faint uppercase">No photo</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(typeof src === "string" ? src : null)}
      {...rest}
    />
  );
}
