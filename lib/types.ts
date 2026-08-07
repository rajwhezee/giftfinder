export type RecipientGender = "male" | "female" | "any";

export interface RecommendRequestBody {
  relationship: string;
  age: number;
  gender: RecipientGender;
  occasion: string;
  interests: string[];
  budget: number;
}

export interface GiftRecommendation {
  id: string;
  name: string;
  /** Always USD. Approximate when originalCurrency isn't "USD". */
  price: number;
  /** The listing's own currency — UI shows "~" on the price when not USD. */
  originalCurrency: string;
  imageUrl: string;
  affiliateUrl: string;
  platform: string;
  matchScore: number;
}

export interface RecommendResponse {
  results: GiftRecommendation[];
  /** Gifts passing occasion/age/budget before interest matching was applied. */
  candidateCount: number;
}
