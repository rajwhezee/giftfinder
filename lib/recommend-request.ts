import { INTERESTS, OCCASIONS, RELATIONSHIPS } from "./gift-options";
import type { RecommendRequestBody } from "./types";

/**
 * Allowlists rather than length caps.
 *
 * Every one of these fields is chosen from a fixed list in the UI, so anything
 * outside it is either a bug or an attack, and there is no legitimate request
 * these reject. Before this the parser only checked *types*: a body with 5,000
 * interests was accepted and took 2.2 s to answer, because the interest list
 * goes straight into a SQL `hasSome` and then into per-row scoring. That is a
 * cheap request to send and an expensive one to serve, which is the shape of an
 * amplification attack. Strings were unbounded too — 200 KB of `occasion` was
 * accepted.
 */
const VALID_INTERESTS = new Set<string>(INTERESTS);
const VALID_OCCASIONS = new Set<string>(OCCASIONS);
const VALID_RELATIONSHIPS = new Set<string>(RELATIONSHIPS);

/**
 * Validation for the quiz answers.
 *
 * Shared by `/api/recommend` and `/api/similar`: "more like this" is still
 * shopping for the same person, so it applies the same hard constraints
 * (occasion, age, gender, budget) and therefore needs the same guarantees
 * about the shape of the answers. Keeping one parser means the two routes
 * cannot drift into disagreeing about what a valid request is.
 */
export function parseRecommendBody(body: unknown): RecommendRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { relationship, age, gender, occasion, interests, minBudget, maxBudget } =
    body as Record<string, unknown>;

  if (typeof relationship !== "string" || !VALID_RELATIONSHIPS.has(relationship)) return null;
  if (typeof occasion !== "string" || !VALID_OCCASIONS.has(occasion)) return null;
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age > 120) return null;
  if (typeof minBudget !== "number" || !Number.isFinite(minBudget) || minBudget < 0) return null;
  if (typeof maxBudget !== "number" || !Number.isFinite(maxBudget) || maxBudget <= 0) return null;
  // An inverted range would silently return nothing, which reads as a broken
  // catalogue rather than a bad request.
  if (minBudget > maxBudget) return null;
  if (gender !== "male" && gender !== "female" && gender !== "any") return null;
  if (
    !Array.isArray(interests) ||
    interests.length > INTERESTS.length ||
    !interests.every((interest) => typeof interest === "string" && VALID_INTERESTS.has(interest))
  ) {
    return null;
  }

  // Duplicates would inflate the SQL `hasSome` and the coverage denominator
  // without adding a single candidate.
  return {
    relationship,
    age,
    gender,
    occasion,
    interests: [...new Set(interests)],
    minBudget,
    maxBudget,
  };
}
