/**
 * Minimal client for the Etsy Open API v3 public listings endpoint.
 *
 * Auth: every v3 request needs an `x-api-key` header containing the app's
 * keystring and shared secret joined by a colon — passing the keystring alone
 * returns 403 "Shared secret is required in x-api-key header".
 * See https://developers.etsy.com/documentation/essentials/authentication
 *
 * Only the fields we actually store are typed here — real responses carry more.
 */

const BASE_URL = "https://openapi.etsy.com/v3/application";

export interface EtsyPrice {
  amount: number;
  divisor: number;
  currency_code: string;
}

export interface EtsyImage {
  url_570xN?: string;
  url_fullxfull?: string;
}

export interface EtsyListing {
  listing_id: number;
  title: string;
  description: string;
  url: string;
  price: EtsyPrice;
  /** "physical" | "download" | "both" — downloads make no sense as shipped gifts. */
  listing_type?: string;
  tags?: string[];
  images?: EtsyImage[];
}

export interface EtsySearchResponse {
  count: number;
  results: EtsyListing[];
}

export class EtsyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "EtsyApiError";
  }
}

/** Etsy prices come as integer minor units plus a divisor (e.g. 1520 / 100). */
export function toMajorUnits(price: EtsyPrice): number {
  if (!price || typeof price.amount !== "number" || !price.divisor) return NaN;
  return price.amount / price.divisor;
}

export function pickImageUrl(listing: EtsyListing): string | null {
  const image = listing.images?.[0];
  return image?.url_570xN ?? image?.url_fullxfull ?? null;
}

export interface SearchParams {
  keywords: string;
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  /** Etsy sorts by relevance when sort_on is omitted. */
  sortOn?: "created" | "price" | "updated" | "score";
}

export interface EtsyCredentials {
  keystring: string;
  sharedSecret: string;
}

/** Etsy expects "<keystring>:<shared_secret>" as the x-api-key value. */
export function buildApiKeyHeader(credentials: EtsyCredentials): string {
  return `${credentials.keystring}:${credentials.sharedSecret}`;
}

/**
 * Fetch listings by id, with images attached.
 *
 * Needed because `/listings/active` silently ignores `includes=Images` — it
 * returns no `images` key at all — while `/listings/batch` honours it. So image
 * URLs require this second call rather than coming back with the search.
 *
 * Etsy caps this endpoint at 100 ids per request; caller should chunk.
 */
export async function getListingsBatch(
  credentials: EtsyCredentials,
  listingIds: number[],
): Promise<EtsyListing[]> {
  if (listingIds.length === 0) return [];

  const url = new URL(`${BASE_URL}/listings/batch`);
  url.searchParams.set("listing_ids", listingIds.join(","));
  url.searchParams.set("includes", "Images");

  const res = await fetch(url, {
    headers: { "x-api-key": buildApiKeyHeader(credentials) },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new EtsyApiError(`Etsy batch API ${res.status}`, res.status, text);
  }

  return (JSON.parse(text) as EtsySearchResponse).results ?? [];
}

/** Etsy returns HTML-escaped text in titles/descriptions. */
export function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    rsquo: "’",
    lsquo: "‘",
    ldquo: "“",
    rdquo: "”",
  };

  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

export async function searchActiveListings(
  credentials: EtsyCredentials,
  params: SearchParams,
): Promise<EtsySearchResponse> {
  const url = new URL(`${BASE_URL}/listings/active`);
  url.searchParams.set("keywords", params.keywords);
  url.searchParams.set("limit", String(params.limit ?? 25));
  url.searchParams.set("includes", "Images");
  if (params.minPrice !== undefined) url.searchParams.set("min_price", String(params.minPrice));
  if (params.maxPrice !== undefined) url.searchParams.set("max_price", String(params.maxPrice));
  if (params.sortOn) url.searchParams.set("sort_on", params.sortOn);

  const res = await fetch(url, {
    headers: { "x-api-key": buildApiKeyHeader(credentials) },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new EtsyApiError(`Etsy API ${res.status} for "${params.keywords}"`, res.status, text);
  }

  return JSON.parse(text) as EtsySearchResponse;
}
