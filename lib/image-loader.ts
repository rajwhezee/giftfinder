"use client";

/**
 * Resizes product photos at the merchant's own CDN instead of through Vercel's
 * image optimizer.
 *
 * The optimizer was returning **HTTP 402 Payment Required** on production: the
 * account's image-transformation allowance was spent, and 95 of 96 photos
 * across four occasion pages failed. Every card fell back to the "No photo"
 * placeholder, which is why the site looked as though the catalogue had no
 * pictures. Nothing was wrong with the URLs — a sweep the same day found only
 * 26 genuinely dead out of 29,582.
 *
 * Every host the catalogue uses already resizes on demand from the URL, so
 * there is nothing for a paid optimizer to add here: the CDNs do the work, the
 * browser fetches direct, and the bill is zero at any traffic level. That suits
 * a site that deliberately earns nothing better than a metered allowance does.
 *
 * The rule for every branch is the same: if anything about a URL is not exactly
 * the shape expected, hand back the original untouched. A photo at the wrong
 * size is a cosmetic problem; a photo at a URL we invented is a broken card.
 */

/** Smallest offered size that still covers `width`, or the largest on offer. */
function fit(width: number, sizes: readonly number[]): number {
  return sizes.find((size) => size >= width) ?? sizes[sizes.length - 1];
}

/** eBay encodes the size in the filename: `s-l800.jpg`. */
const EBAY_SIZES = [200, 300, 400, 500, 600, 800, 960, 1200, 1600] as const;

/** Etsy encodes it in an `il_794xN` segment. Only these widths are rendered. */
const ETSY_SIZES = [180, 270, 340, 570, 600, 794, 1140, 1588] as const;

export default function merchantImageLoader({ src, width }: { src: string; width: number }): string {
  try {
    const url = new URL(src);

    switch (url.hostname) {
      case "cdn.shopify.com": {
        // Shopify honours ?width= on any product image, and the importer often
        // stored one already — setting it replaces rather than appends.
        url.searchParams.set("width", String(width));
        return url.toString();
      }

      case "i.ebayimg.com": {
        const replaced = url.pathname.replace(
          /\/s-l\d+\.(jpg|jpeg|png|webp)$/i,
          (_match, ext: string) => `/s-l${fit(width, EBAY_SIZES)}.${ext}`,
        );
        if (replaced === url.pathname) return src;
        url.pathname = replaced;
        return url.toString();
      }

      case "i.etsystatic.com": {
        // Both `il_794xN.123_abc.jpg` and `il_fullxfull.123_abc.jpg` occur.
        const replaced = url.pathname.replace(
          /\/il_[^/]*?x[^/.]*\./,
          `/il_${fit(width, ETSY_SIZES)}xN.`,
        );
        if (replaced === url.pathname) return src;
        url.pathname = replaced;
        return url.toString();
      }

      case "i5.walmartimages.com": {
        url.searchParams.set("odnWidth", String(width));
        return url.toString();
      }

      default:
        // Eight Walmart rows aside, the catalogue is three hosts. Anything else
        // is a host we have not measured, and guessing at its resize contract
        // would break the card rather than shrink it.
        return src;
    }
  } catch {
    return src;
  }
}
