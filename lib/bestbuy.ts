/**
 * Minimal client for the Best Buy Products API.
 *
 * Read-only, single `apiKey` query param — no OAuth, no affiliate membership
 * required for product data. See https://bestbuyapis.github.io/api-documentation/
 *
 * Query syntax is Best Buy's own: parenthesised attribute expressions joined by
 * `&` (AND) or `|` (OR), e.g. `(search=headphones&salePrice<200)`.
 *
 * Only the fields we actually store are typed here — `show=all` returns far more.
 */

const BASE_URL = "https://api.bestbuy.com/v1/products";

/** Fields requested via `show`; keep in sync with BestBuyProduct below. */
const FIELDS = [
  "sku",
  "name",
  "shortDescription",
  "salePrice",
  "regularPrice",
  "image",
  "largeFrontImage",
  "url",
  "manufacturer",
  "customerReviewAverage",
  "customerReviewCount",
  "onlineAvailability",
].join(",");

export interface BestBuyProduct {
  sku: number;
  name: string;
  shortDescription?: string | null;
  salePrice: number;
  regularPrice?: number;
  image?: string | null;
  largeFrontImage?: string | null;
  url: string;
  manufacturer?: string | null;
  customerReviewAverage?: number | null;
  customerReviewCount?: number | null;
  onlineAvailability?: boolean;
}

export interface BestBuySearchResponse {
  from: number;
  to: number;
  total: number;
  currentPage: number;
  totalPages: number;
  products: BestBuyProduct[];
}

export class BestBuyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "BestBuyApiError";
  }
}

export interface SearchParams {
  /** Raw Best Buy query expression, without the outer parentheses. */
  query: string;
  page?: number;
  /** Max 100 per the API docs. */
  pageSize?: number;
  sort?: string;
}

export async function searchProducts(
  apiKey: string,
  params: SearchParams,
): Promise<BestBuySearchResponse> {
  // The query expression is part of the path, not a query param.
  const url = new URL(`${BASE_URL}(${params.query})`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("show", FIELDS);
  url.searchParams.set("pageSize", String(Math.min(params.pageSize ?? 50, 100)));
  url.searchParams.set("page", String(params.page ?? 1));
  if (params.sort) url.searchParams.set("sort", params.sort);

  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new BestBuyApiError(
      `Best Buy API ${res.status} for "${params.query}"`,
      res.status,
      text,
    );
  }

  return JSON.parse(text) as BestBuySearchResponse;
}

/** Prefer the larger render when Best Buy provides one. */
export function pickImageUrl(product: BestBuyProduct): string | null {
  return product.largeFrontImage || product.image || null;
}
