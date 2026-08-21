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
 * What the quiz actually shows for "what are they into", as opposed to the tag
 * vocabulary above.
 *
 * INTERESTS is the vocabulary the tagger writes and the API validates, and it
 * stays exactly as it is. This is the reading order, and it exists because the
 * two jobs had been conflated: the quiz rendered INTERESTS directly, so the
 * order products happened to be tagged in became the order 33 chips were read
 * in, and those turned out to be unrelated. Music led the list at 2.8% of the
 * catalogue and Photography sat fourth at 1.1%, while Fashion, the largest
 * shelf at 39.3%, was twenty-fifth.
 *
 * Two things follow from that, both measured against the live catalogue on
 * 2026-08-21 at 18,792 gifts:
 *
 * - Ordered by depth. The first row is now the densest five rather than two of
 *   the thinnest, so the chips people read first are the ones with something
 *   behind them. MIN_INTEREST_MATCHES is 1, which means a single thin pick is
 *   the whole search: choosing only Painting searched 144 rows.
 * - The first twelve reach 97.0% of the catalogue between them, which is what
 *   makes it safe for the quiz to show twelve and fold the rest away.
 *
 * "Family" is in the vocabulary but has no chip. It answered "who is this
 * for", which the quiz already asked in its first question, so as an *interest*
 * it read as a category error next to Cooking and Travel. Dropping the chip
 * strands nothing: no gift carries Family as its only interest, so every row it
 * touches is still reachable through the rest of its tags. The tag itself stays
 * because enrich-tags writes it and the API validates against it.
 *
 * `tags` is what a chip selects. Most select one. A few select two, where the
 * vocabulary drew a line shoppers do not: Beauty and Self-care are 2,082 and
 * 3,111 rows but only 3,205 together, so they were largely the same products
 * asking to be told apart. Merging at this layer costs nothing downstream,
 * because the tags themselves are untouched and enrich-tags still owns them.
 */
export interface InterestChoice {
  /** What the chip says. */
  label: string;
  /** The tags it selects. The first also supplies the chip's emoji. */
  tags: string[];
}

export const INTEREST_CHOICES: InterestChoice[] = [
  { label: "Fashion", tags: ["Fashion"] },
  { label: "Home Decor", tags: ["Home Decor"] },
  // Cars and Bags sit high by request rather than by depth, but not first:
  // leading with a 209-row shelf is the same mistake the old order made with
  // Music. Third and fourth keeps them in the first line people read while the
  // two largest shelves still open the list.
  { label: "Cars", tags: ["Cars"] },
  { label: "Bags", tags: ["Bags"] },
  { label: "Beauty & Self-care", tags: ["Beauty", "Self-care"] },
  { label: "Travel", tags: ["Travel"] },
  { label: "Sports", tags: ["Sports"] },
  { label: "Cooking & Food", tags: ["Cooking", "Food"] },
  { label: "Sneakers", tags: ["Sneakers"] },
  { label: "Tech", tags: ["Tech"] },
  { label: "Art", tags: ["Art", "Painting"] },
  { label: "Gaming", tags: ["Gaming", "Games"] },
  { label: "Creativity", tags: ["Creativity"] },
  // Everything below here is behind the "more" cut in the quiz.
  { label: "Jewelry", tags: ["Jewelry"] },
  { label: "Writing", tags: ["Writing"] },
  { label: "Outdoors", tags: ["Outdoors"] },
  { label: "Health & Fitness", tags: ["Health", "Fitness"] },
  { label: "Coffee", tags: ["Coffee"] },
  { label: "Reading", tags: ["Reading"] },
  { label: "Pets", tags: ["Pets"] },
  { label: "Music", tags: ["Music"] },
  { label: "Romance", tags: ["Romance"] },
  { label: "Gardening", tags: ["Gardening"] },
  { label: "Astronomy", tags: ["Astronomy"] },
  { label: "Photography", tags: ["Photography"] },
  { label: "STEM", tags: ["STEM"] },
  // Last, out of depth order on purpose. It is ninth by volume at 9.7%, but it
  // describes how a gift is made rather than anything a person is into, so it
  // reads as the odd one out in a row of them. It costs nothing to move: it
  // overlaps heavily with the shelves above it, so promoting Creativity into
  // the twelfth slot in its place took the visible dozen from 96.6% of the
  // catalogue to 97.0%.
  { label: "Personalized", tags: ["Personalized"] },
];

/** How many chips the quiz shows before folding the rest behind "more". */
export const INTERESTS_SHOWN = 12;

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
];
