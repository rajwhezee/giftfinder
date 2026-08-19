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
export const OCCASIONS = [
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

export const BUDGET_MIN = 10;
export const BUDGET_MAX = 500;
export const BUDGET_STEP = 5;

/**
 * The budget step is a range, so a ceiling at BUDGET_MAX means "and up" rather
 * than a hard cap — the catalogue carries items well past $500 and there is no
 * reason to hide them from someone who dragged the slider all the way over.
 * Both the API filter and the price-fit score check for this.
 */
export const BUDGET_UNCAPPED_AT = BUDGET_MAX;

export const BUDGET_RANGE_PRESETS = [
  { label: "Under $25", min: BUDGET_MIN, max: 25 },
  { label: "$25–75", min: 25, max: 75 },
  { label: "$75–150", min: 75, max: 150 },
  { label: "$150+", min: 150, max: BUDGET_MAX },
] as const;
