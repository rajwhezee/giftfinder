import { BUDGET_MAX, INTERESTS, RELATIONSHIPS } from "./gift-options";

/**
 * Composite scoring for gift recommendations.
 *
 * Everything here is pure — no DB, no I/O — so it can be reasoned about and
 * tested directly. The API route does the hard filtering (occasion, age range,
 * budget ceiling) in SQL, then hands the surviving candidates here to be
 * ordered.
 *
 * Four signals, each normalized to 0..1 (relationship can go negative), then
 * combined with the weights below. Weights are deliberately in one place so
 * they can be tuned without touching the logic.
 */

export const WEIGHTS = {
  interest: 0.55,
  relationship: 0.2,
  budget: 0.15,
  age: 0.1,
} as const;

/**
 * A gift must share at least this many interests with the quiz answers to be
 * shown at all. Set to 1 so we never pad results with items that matched only
 * on occasion/age/budget — those read as "we didn't understand you".
 */
export const MIN_INTEREST_MATCHES = 1;

type Relationship = (typeof RELATIONSHIPS)[number];
type Interest = (typeof INTERESTS)[number];

/**
 * EDITORIAL, NOT DERIVED FROM DATA. These encode a human judgment about what
 * tends to suit each relationship, and they are the most opinionated part of
 * the ranking — they're the first thing to revisit if results feel off.
 *
 * `affinity` nudges fitting categories up. `avoid` pushes down gifts that are
 * too intimate or personal for the relationship (an engraved bracelet is a
 * lovely gift for a partner and an uncomfortable one from a coworker).
 */
const RELATIONSHIP_AFFINITY: Record<Relationship, { affinity: Interest[]; avoid: Interest[] }> = {
  Partner: {
    affinity: ["Romance", "Jewelry", "Personalized", "Self-care", "Travel"],
    avoid: [],
  },
  Friend: {
    affinity: ["Games", "Music", "Fashion", "Outdoors", "Food", "Gaming"],
    avoid: ["Romance"],
  },
  Parent: {
    affinity: ["Home Decor", "Cooking", "Gardening", "Self-care", "Reading"],
    avoid: ["Romance", "Gaming"],
  },
  Sibling: {
    affinity: ["Gaming", "Music", "Fashion", "Games", "Tech"],
    avoid: ["Romance"],
  },
  Child: {
    affinity: ["Games", "STEM", "Creativity", "Reading", "Art"],
    avoid: ["Romance", "Beauty", "Jewelry", "Self-care"],
  },
  Coworker: {
    // Low-intimacy, safely impersonal gifts.
    affinity: ["Coffee", "Food", "Home Decor", "Writing"],
    avoid: ["Romance", "Jewelry", "Personalized", "Beauty", "Self-care", "Fashion"],
  },
  Other: { affinity: [], avoid: [] },
};

export interface ScoreInput {
  giftInterests: string[];
  giftPrice: number;
  giftAgeMin: number;
  giftAgeMax: number;
  selectedInterests: string[];
  relationship: string;
  age: number;
  budget: number;
}

export interface ScoreBreakdown {
  total: number;
  interestMatches: number;
  interest: number;
  relationship: number;
  budget: number;
  age: number;
}

/**
 * Thematic fit. Divided by the smaller of (how many interests the user picked)
 * and (how many the gift has), so a focused gift that fully matches a subset of
 * a long interest list still scores 1.0 rather than being punished for the
 * user having broad taste.
 */
function interestScore(giftInterests: string[], selected: string[]): number {
  if (selected.length === 0 || giftInterests.length === 0) return 0;
  const matches = giftInterests.filter((i) => selected.includes(i)).length;
  const denominator = Math.min(selected.length, giftInterests.length);
  return Math.min(matches / denominator, 1);
}

/** Affinity boost minus intimacy penalty, clamped to -1..1. */
function relationshipScore(giftInterests: string[], relationship: string): number {
  const table = RELATIONSHIP_AFFINITY[relationship as Relationship];
  if (!table || giftInterests.length === 0) return 0;

  const boost = giftInterests.filter((i) => table.affinity.includes(i as Interest)).length / giftInterests.length;
  const penalty = giftInterests.some((i) => table.avoid.includes(i as Interest)) ? 1 : 0;

  return Math.max(-1, Math.min(1, boost - penalty));
}

/**
 * Where the price sits inside the budget. Something at 70% of budget generally
 * feels like a more considered gift than something at 5% of it, so the sweet
 * spot is the upper-middle of the range. Never penalizes below 0.5 — cheap
 * isn't disqualifying, just less "this was chosen for you".
 *
 * Uncapped mode (budget === Infinity, from the "$500+" preset) means the user
 * asked for premium: score rises linearly with price up to BUDGET_MAX and
 * stays maxed above it, so pricier gifts actively outrank cheaper ones.
 */
function budgetScore(price: number, budget: number): number {
  if (budget <= 0) return 0;
  if (!Number.isFinite(budget)) {
    return Math.min(price / BUDGET_MAX, 1);
  }
  const ratio = price / budget;
  if (ratio > 1) return 0; // shouldn't happen (filtered in SQL), but fail safe
  if (ratio >= 0.4 && ratio <= 0.95) return 1;
  if (ratio > 0.95) return 0.9;
  return 0.5 + (ratio / 0.4) * 0.5;
}

/**
 * Two things: how centered the recipient's age is in the gift's range, and how
 * specific that range is. A gift targeted 3–12 for an 8-year-old is a more
 * deliberate match than one labelled 13–99.
 */
function ageScore(ageMin: number, ageMax: number, age: number): number {
  const width = Math.max(0, ageMax - ageMin);
  const specificity = 1 - Math.min(width / 100, 1);

  if (width === 0) return Math.max(specificity, 0.5);
  const center = (ageMin + ageMax) / 2;
  const halfWidth = width / 2;
  const distanceRatio = Math.min(Math.abs(age - center) / halfWidth, 1);
  const centeredness = 1 - distanceRatio;

  return 0.5 * centeredness + 0.5 * specificity;
}

export function scoreGift(input: ScoreInput): ScoreBreakdown {
  const interest = interestScore(input.giftInterests, input.selectedInterests);
  const relationship = relationshipScore(input.giftInterests, input.relationship);
  const budget = budgetScore(input.giftPrice, input.budget);
  const age = ageScore(input.giftAgeMin, input.giftAgeMax, input.age);

  const total =
    interest * WEIGHTS.interest +
    relationship * WEIGHTS.relationship +
    budget * WEIGHTS.budget +
    age * WEIGHTS.age;

  return {
    total,
    interestMatches: input.giftInterests.filter((i) => input.selectedInterests.includes(i)).length,
    interest,
    relationship,
    budget,
    age,
  };
}
