export type RecipientGender = "male" | "female" | "any";

export interface RecommendRequestBody {
  relationship: string;
  age: number;
  gender: RecipientGender;
  occasion: string;
  interests: string[];
  /** Lower bound of the chosen budget band, in USD. */
  minBudget: number;
  /** Upper bound. At BUDGET_UNCAPPED_AT this means "and up", not a hard cap. */
  maxBudget: number;
}

export interface GiftRecommendation {
  id: string;
  name: string;
  /** Always USD. Approximate when originalCurrency isn't "USD". */
  price: number;
  /** The listing's own currency — UI shows "~" on the price when not USD. */
  originalCurrency: string;
  imageUrl: string;
  productUrl: string;
  platform: string;
  /** What the thing is — "Keyboards", "Shoes". Null when no rule matched it. */
  category: string | null;
  matchScore: number;
}

export interface RecommendResponse {
  results: GiftRecommendation[];
  /** Gifts passing occasion/age/budget before interest matching was applied. */
  candidateCount: number;
}

export interface SimilarRequestBody extends RecommendRequestBody {
  /** The product the shopper pointed at. Its tags, title and price are the query. */
  giftId: string;
  /** Ids already on the page, so the strip offers discoveries rather than repeats. */
  excludeIds: string[];
}

export interface SimilarResponse {
  results: GiftRecommendation[];
}
