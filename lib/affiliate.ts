/**
 * Turns a gift's raw product URL into its platform-specific affiliate URL.
 *
 * Two strategies are supported, chosen per platform in PLATFORM_CONFIG:
 *
 *  - "append-params": add tracking query params directly onto the product URL.
 *    Used by platforms with their own affiliate program (Amazon Associates, eBay
 *    Partner Network) where the retailer's own site reads the params.
 *
 *  - "network-redirect": wrap the product URL as a param inside an affiliate
 *    network's click-tracking URL (e.g. Awin's cread.php), which records the
 *    click and then 302s the shopper to the destination. Used when the
 *    merchant doesn't run its own affiliate program directly. Unlike
 *    append-params, this strategy only degrades gracefully if it *doesn't*
 *    fire on placeholder IDs — a redirect to a tracking endpoint that doesn't
 *    recognize the ID goes nowhere useful, which is worse than no wrapping at
 *    all. So each network-redirect entry has an `isConfigured` check; until
 *    real IDs are set, buildAffiliateUrl skips wrapping and returns the real
 *    product URL instead.
 *
 * Adding a new platform means adding one entry to PLATFORM_CONFIG — no other
 * code needs to change. Unknown platforms (not in the map) fall through to
 * the original URL unchanged, and malformed URLs are also handled by falling
 * back to the original rather than throwing.
 *
 * Example cases:
 *
 *   buildAffiliateUrl({ platform: "Amazon", affiliateUrl: "https://www.amazon.com/dp/B0EXAMPLE" })
 *   // => "https://www.amazon.com/dp/B0EXAMPLE?tag=<NEXT_PUBLIC_AMAZON_TAG>"
 *
 *   buildAffiliateUrl({ platform: "Amazon", affiliateUrl: "https://www.amazon.com/dp/B0EXAMPLE?psc=1" })
 *   // => "https://www.amazon.com/dp/B0EXAMPLE?psc=1&tag=<NEXT_PUBLIC_AMAZON_TAG>"
 *   // (existing query params are preserved; URLSearchParams.set only touches the tag param)
 *
 *   buildAffiliateUrl({ platform: "eBay", affiliateUrl: "https://www.ebay.com/itm/12345" })
 *   // => "https://www.ebay.com/itm/12345?campid=<NEXT_PUBLIC_EBAY_CAMPID>"
 *
 *   buildAffiliateUrl({ platform: "Etsy", affiliateUrl: "https://www.etsy.com/listing/999?ref=shop" })
 *   // With NEXT_PUBLIC_AWIN_ETSY_MERCHANT_ID and NEXT_PUBLIC_AWIN_AFFILIATE_ID both set:
 *   // => "https://www.awin1.com/cread.php?awinmid=<...>&awinaffid=<...>&clickref=&p=https%3A%2F%2Fwww.etsy.com%2Flisting%2F999%3Fref%3Dshop"
 *   // (destination URL, including its own query string, is percent-encoded into `p` by URLSearchParams)
 *   // With either unset (not yet approved for Awin): => "https://www.etsy.com/listing/999?ref=shop" (unchanged)
 *
 *   buildAffiliateUrl({ platform: "Walmart", affiliateUrl: "https://www.walmart.com/ip/example/123" })
 *   // With both NEXT_PUBLIC_IMPACT_WALMART_* vars set:
 *   // => "https://goto.walmart.com/c/<accountId>/<campaignId>?veh=aff&u=https%3A%2F%2Fwww.walmart.com%2Fip%2Fexample%2F123"
 *   // NOTE: Walmart's program runs on Impact, which issues an account-specific deep-link
 *   // template on approval — verify this shape against the real one before going live.
 *   // With either unset (not yet approved for Impact): => "https://www.walmart.com/ip/example/123" (unchanged)
 *
 *   buildAffiliateUrl({ platform: "Unknown Store", affiliateUrl: "https://example.com/product" })
 *   // => "https://example.com/product" (unchanged — no config entry for this platform)
 *
 *   buildAffiliateUrl({ platform: "Amazon", affiliateUrl: "not-a-url" })
 *   // => "not-a-url" (unchanged — invalid URL, fails safe instead of throwing)
 */

interface AppendParamsStrategy {
  type: "append-params";
  /** Read lazily so tests / different env values are picked up per call, not cached at import time. */
  getParams: () => Record<string, string>;
}

interface NetworkRedirectStrategy {
  type: "network-redirect";
  /**
   * Whether real IDs are set for this network (as opposed to the placeholder
   * fallbacks). Unlike append-params, a network-redirect with fake IDs doesn't
   * degrade gracefully — it replaces a working product link with a redirect to
   * a tracking endpoint that doesn't recognize those IDs. So when this is
   * false, buildAffiliateUrl skips wrapping entirely and returns the real URL.
   */
  isConfigured: () => boolean;
  /** Lazy for the same reason as getParams — some networks embed IDs in the path itself. */
  getRedirectBaseUrl: () => string;
  /** Query param on redirectBaseUrl that holds the URL-encoded destination. */
  destinationParam: string;
  getExtraParams: () => Record<string, string>;
}

type PlatformStrategy = AppendParamsStrategy | NetworkRedirectStrategy;

const PLATFORM_CONFIG: Record<string, PlatformStrategy> = {
  amazon: {
    type: "append-params",
    getParams: () => ({
      tag: process.env.NEXT_PUBLIC_AMAZON_TAG || "giftfinder-20",
    }),
  },
  ebay: {
    type: "append-params",
    getParams: () => ({
      campid: process.env.NEXT_PUBLIC_EBAY_CAMPID || "0000000000",
    }),
  },
  etsy: {
    type: "network-redirect",
    isConfigured: () =>
      Boolean(process.env.NEXT_PUBLIC_AWIN_ETSY_MERCHANT_ID) &&
      Boolean(process.env.NEXT_PUBLIC_AWIN_AFFILIATE_ID),
    getRedirectBaseUrl: () => "https://www.awin1.com/cread.php",
    destinationParam: "p",
    getExtraParams: () => ({
      awinmid: process.env.NEXT_PUBLIC_AWIN_ETSY_MERCHANT_ID || "00000",
      awinaffid: process.env.NEXT_PUBLIC_AWIN_AFFILIATE_ID || "000000",
      clickref: "",
    }),
  },
  // NOTE: this is Walmart's documented Impact deep-link format as of this
  // writing (goto.walmart.com/c/{accountId}/{campaignId}?u=<destination>).
  // Impact issues your exact template on approval (Impact dashboard -> Walmart
  // program -> "Get Links") — confirm it matches before relying on it, since
  // param names can vary per program.
  walmart: {
    type: "network-redirect",
    isConfigured: () =>
      Boolean(process.env.NEXT_PUBLIC_IMPACT_WALMART_ACCOUNT_ID) &&
      Boolean(process.env.NEXT_PUBLIC_IMPACT_WALMART_CAMPAIGN_ID),
    getRedirectBaseUrl: () =>
      `https://goto.walmart.com/c/${process.env.NEXT_PUBLIC_IMPACT_WALMART_ACCOUNT_ID || "0000000"}/${
        process.env.NEXT_PUBLIC_IMPACT_WALMART_CAMPAIGN_ID || "0000000"
      }`,
    destinationParam: "u",
    getExtraParams: () => ({ veh: "aff" }),
  },
};

function appendParams(rawUrl: string, params: Record<string, string>): string {
  const url = new URL(rawUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function wrapInNetworkRedirect(
  rawUrl: string,
  strategy: NetworkRedirectStrategy,
): string {
  const redirectUrl = new URL(strategy.getRedirectBaseUrl());
  for (const [key, value] of Object.entries(strategy.getExtraParams())) {
    redirectUrl.searchParams.set(key, value);
  }
  redirectUrl.searchParams.set(strategy.destinationParam, rawUrl);
  return redirectUrl.toString();
}

export function buildAffiliateUrl(gift: { affiliateUrl: string; platform: string }): string {
  const config = PLATFORM_CONFIG[gift.platform.trim().toLowerCase()];
  if (!config) return gift.affiliateUrl;
  if (config.type === "network-redirect" && !config.isConfigured()) return gift.affiliateUrl;

  try {
    return config.type === "append-params"
      ? appendParams(gift.affiliateUrl, config.getParams())
      : wrapInNetworkRedirect(gift.affiliateUrl, config);
  } catch {
    return gift.affiliateUrl;
  }
}
