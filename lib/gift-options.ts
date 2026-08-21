export const RELATIONSHIPS = [
  "Partner",
  "Friend",
  "Parent",
  "Sibling",
  "Child",
  "Coworker",
  "Other",
] as const;

// Keep in sync with prisma/seed.ts and the query manifest in scripts/import-etsy.ts —
// an occasion here with no matching import query will always return zero results.
/**
 * The reason that isn't one: seeing someone after a long time, or simply
 * feeling like it.
 *
 * Unlike every other entry it is not a tag any gift carries. Occasions come
 * from the import query, so tagging ~19,000 rows "Just Because" would be
 * inventing data to express the absence of a constraint. It is a *filter that
 * isn't applied* instead — both query sites drop the `occasions` clause for
 * it, so the whole catalogue is in scope.
 *
 * `namesADifferentOccasion` then does the rest for free: it has no pattern of
 * its own, so any title that names a specific occasion is excluded. A "Happy
 * Birthday Banner" is a fine birthday gift and a bad just-because one, and
 * that falls out of the existing logic without a special case.
 */
export const JUST_BECAUSE = "Just Because";

export const OCCASIONS = [
  JUST_BECAUSE,
  "Birthday",
  "Christmas",
  "Graduation",
  "Housewarming",
  "Wedding",
  "Anniversary",
  "New Year",
  "Family Gathering",
  "Get Well Soon",
  "Mother's Day",
  "Father's Day",
  "Valentine's Day",
  "Thank You",
  // International & cultural celebrations
  "Diwali",
  "Holi",
  "Raksha Bandhan",
  "Eid al-Fitr",
  "Eid al-Adha",
  "Hanukkah",
  "Passover",
  "Lunar New Year",
  "Mid-Autumn Festival",
  "Nowruz",
  "Vaisakhi",
  "Onam",
  "Quinceañera",
  "Day of the Dead",
  "Kwanzaa",
  "St. Patrick's Day",
  "Oktoberfest",
  "Carnival",
  "Vesak",
  "Bar/Bat Mitzvah",
  "Baby Shower",
  "Retirement",
] as const;

// Keep in sync with the interests used in prisma/seed.ts.
export const INTERESTS = [
  "Music",
  "Tech",
  "Travel",
  "Photography",
  "Art",
  "Coffee",
  "Cooking",
  "Gaming",
  "Writing",
  "Fitness",
  "Health",
  "Games",
  "Family",
  "Gardening",
  "Home Decor",
  "Outdoors",
  "Beauty",
  "Self-care",
  "Painting",
  "Astronomy",
  "Romance",
  "Sports",
  "STEM",
  "Creativity",
  "Fashion",
  "Food",
  "Jewelry",
  "Personalized",
  "Reading",
  "Cars",
  // Deep enough to stand on its own once the sneaker boutiques import: ~1,071
  // products, ahead of Sports, Tech and Music. Before them it was Fashion +
  // Sports, which put a Jordan 1 next to a handbag and a yoga mat.
  "Sneakers",
  // No existing interest covered someone shopping for a dog owner, and it is
  // one of the largest gifting categories there is.
  "Pets",
  // Handbags, totes and carry. Was Fashion + Travel, which is also a scarf and
  // a suitcase; the bag brands are a category people shop by name.
  "Bags",
] as const;

/**
 * The slider's stops, non-linear on purpose.
 *
 * The catalogue's median gift is $60 and its 90th percentile is $298, but it
 * now runs to four figures. A linear $10-1500 track would squeeze the range
 * almost everyone shops into its first tenth, so the stops are fine where the
 * catalogue is dense and coarse where it is thin: $5 apart up to $200, $10 to
 * $500, $25 to $1000, $50 beyond.
 */
function buildBudgetScale(): number[] {
  const scale: number[] = [];
  for (let v = 10; v < 200; v += 5) scale.push(v);
  for (let v = 200; v < 500; v += 10) scale.push(v);
  for (let v = 500; v < 1000; v += 25) scale.push(v);
  for (let v = 1000; v <= 1500; v += 50) scale.push(v);
  return scale;
}

export const BUDGET_SCALE = buildBudgetScale();

export const BUDGET_MIN = BUDGET_SCALE[0];
/**
 * Raised from 500 when the catalogue gained its luxury end. 99.3% of gifts sit
 * below this; the rest stay reachable because the top of the slider means "and
 * up" rather than a ceiling.
 */
export const BUDGET_MAX = BUDGET_SCALE[BUDGET_SCALE.length - 1];
/** Smallest gap the two thumbs may be apart, in scale positions. */
export const BUDGET_STEP = 1;

/** Nearest scale position to a price, for seeding the sliders from a preset. */
export function budgetIndexOf(price: number): number {
  let best = 0;
  for (let i = 1; i < BUDGET_SCALE.length; i++) {
    if (Math.abs(BUDGET_SCALE[i] - price) < Math.abs(BUDGET_SCALE[best] - price)) best = i;
  }
  return best;
}

/**
 * The budget step is a range, so a ceiling at BUDGET_MAX means "and up" rather
 * than a hard cap — the catalogue carries items well past it and there is no
 * reason to hide them from someone who dragged the slider all the way over.
 * Both the API filter and the price-fit score check for this.
 */
export const BUDGET_UNCAPPED_AT = BUDGET_MAX;

export const BUDGET_RANGE_PRESETS = [
  { label: "Under $25", min: BUDGET_MIN, max: 25 },
  { label: "$25–75", min: 25, max: 75 },
  { label: "$75–150", min: 75, max: 150 },
  { label: "$150–500", min: 150, max: 500 },
  // Uncapped, because its ceiling is BUDGET_MAX.
  { label: "$500+", min: 500, max: BUDGET_MAX },
] as const;

/**
 * Crawlable entry points into the occasion pages, in the order they are shown.
 *
 * The quiz is a client component that renders no gift markup, so without these
 * Google would find a single page with nothing to index. Shared by the homepage
 * and the 404 page: both exist to get someone into an occasion page, and two
 * hand-maintained lists would drift.
 */
export const FEATURED_OCCASIONS = [
  JUST_BECAUSE,
  "Birthday",
  "Christmas",
  "Anniversary",
  "Diwali",
  "Valentine's Day",
  "Wedding",
  "Eid al-Fitr",
  "Mother's Day",
  "Graduation",
  "Lunar New Year",
  "Housewarming",
  "Raksha Bandhan",
  // Fifteen rather than a dozen: the homepage sets these as a three-column
  // index, and 13 left a single orphan on the last row. Both additions are
  // occasions people genuinely shop for rather than filler to square the grid.
  "Hanukkah",
  "Thank You",
];
