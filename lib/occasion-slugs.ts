import { OCCASIONS } from "./gift-options";

/**
 * URL slugs for occasion landing pages.
 *
 * Occasion names carry apostrophes, accents and slashes ("Mother's Day",
 * "Quinceañera", "Bar/Bat Mitzvah"), none of which belong in a URL. Diacritics
 * are decomposed and stripped rather than percent-encoded so the URL stays
 * readable and typeable.
 */
export function occasionToSlug(occasion: string): string {
  return occasion
    .normalize("NFD")
    // Strip combining marks left behind by NFD (ñ -> n, é -> e).
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Apostrophes are elided, not separated — "Mother's Day" should slug to
    // "mothers-day", not "mother-s-day".
    .replace(/['’ʼ.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Built once — the occasion list is static. */
const SLUG_TO_OCCASION: Record<string, string> = Object.fromEntries(
  OCCASIONS.map((occasion) => [occasionToSlug(occasion), occasion]),
);

export function slugToOccasion(slug: string): string | null {
  return SLUG_TO_OCCASION[slug] ?? null;
}

export const OCCASION_SLUGS = Object.keys(SLUG_TO_OCCASION);
