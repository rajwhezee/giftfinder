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
] as const;

export const BUDGET_MIN = 10;
export const BUDGET_MAX = 500;
export const BUDGET_STEP = 5;
export const BUDGET_PRESETS = [25, 75, 150, 500] as const;
