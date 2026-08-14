/**
 * Client for the eBay Browse API.
 *
 * Auth is OAuth2 *client credentials* — an application token, not a user token.
 * We never ask a buyer or seller to authorise anything and never touch account
 * data; this only reads the public search index.
 *
 * Docs: https://developer.ebay.com/api-docs/buy/browse/resources/methods
 */

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const MARKETPLACE = "EBAY_US";

/**
 * Required whenever the AUTHENTICITY_GUARANTEE filter is used — eBay rejects
 * that filter without a delivery destination. A US metro postcode is enough to
 * scope results; nothing about it is user-specific.
 */
export const DELIVERY_COUNTRY = "US";
export const DELIVERY_POSTAL_CODE = "10001";

export interface EbayCredentials {
  clientId: string;
  clientSecret: string;
}

export interface EbayItemSummary {
  itemId: string;
  legacyItemId?: string;
  title: string;
  condition?: string;
  conditionId?: string;
  price?: { value: string; currency: string };
  image?: { imageUrl: string };
  thumbnailImages?: { imageUrl: string }[];
  itemWebUrl: string;
  seller?: {
    username?: string;
    feedbackPercentage?: string;
    feedbackScore?: number;
  };
}

export interface EbaySearchResponse {
  total?: number;
  itemSummaries?: EbayItemSummary[];
}

export class EbayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "EbayApiError";
  }
}

/**
 * Application tokens last ~2 hours. Cache in-process and refresh a minute early
 * so a long import doesn't fail midway on an expiry boundary.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(credentials: EbayCredentials): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new EbayApiError(`eBay OAuth failed (${res.status})`, res.status, text);
  }

  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

export interface SearchParams {
  q: string;
  limit?: number;
  /** Raw eBay filter string, e.g. `conditions:{NEW},price:[10..500]`. */
  filter?: string;
  sort?: string;
}

export async function searchItems(
  credentials: EbayCredentials,
  params: SearchParams,
): Promise<EbaySearchResponse> {
  const token = await getAccessToken(credentials);

  const query = new URLSearchParams({
    q: params.q,
    limit: String(Math.min(params.limit ?? 50, 200)),
  });
  if (params.filter) query.set("filter", params.filter);
  if (params.sort) query.set("sort", params.sort);

  const res = await fetch(`${BROWSE_URL}?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new EbayApiError(`eBay Browse ${res.status} for "${params.q}"`, res.status, text);
  }

  return JSON.parse(text) as EbaySearchResponse;
}

/**
 * Search thumbnails come back at 225px (`s-l225.jpg`), which is far too small
 * for a product card. eBay serves other sizes from the same path, so ask for
 * 800px.
 */
export function pickImageUrl(item: EbayItemSummary): string | null {
  const src = item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl;
  if (!src) return null;
  return src.replace(/\/s-l\d+\.(jpg|png|webp)/i, "/s-l800.$1");
}

/** `itemWebUrl` carries search-tracking query junk; the bare /itm/ path resolves fine. */
export function cleanItemUrl(item: EbayItemSummary): string {
  try {
    const url = new URL(item.itemWebUrl);
    url.search = "";
    return url.toString();
  } catch {
    return item.itemWebUrl;
  }
}
