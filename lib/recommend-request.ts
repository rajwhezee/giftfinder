import type { RecommendRequestBody } from "./types";

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

  if (typeof relationship !== "string" || relationship.trim().length === 0) return null;
  if (typeof occasion !== "string" || occasion.trim().length === 0) return null;
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age > 120) return null;
  if (typeof minBudget !== "number" || !Number.isFinite(minBudget) || minBudget < 0) return null;
  if (typeof maxBudget !== "number" || !Number.isFinite(maxBudget) || maxBudget <= 0) return null;
  // An inverted range would silently return nothing, which reads as a broken
  // catalogue rather than a bad request.
  if (minBudget > maxBudget) return null;
  if (gender !== "male" && gender !== "female" && gender !== "any") return null;
  if (!Array.isArray(interests) || !interests.every((interest) => typeof interest === "string")) {
    return null;
  }

  return { relationship, age, gender, occasion, interests, minBudget, maxBudget };
}
