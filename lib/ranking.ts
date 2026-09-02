import { BUDGET_MAX, INTEREST_CHOICES, INTERESTS, RELATIONSHIPS } from "./gift-options";
import { KNOWN_BRANDS, RECOGNITION_BOOST } from "./known-brands";

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

/**
 * Below this giftScore a product is demoted; at or above it, nothing happens.
 *
 * A threshold rather than a smooth curve because that is what the signal
 * supports. The scores cluster hard between 55 and 78 and only separate at the
 * bottom, so treating the middle as meaningful would be reading noise. What it
 * reliably identifies is the tail: refills, craft supplies, replacement parts.
 *
 * 20, not 40. The full catalogue run made the difference legible, and a
 * 1,000-row pilot drawn from one end of the id space had not:
 *
 *   0-19   labels, stickers, craft charms, wholesale gemstone lots, party
 *          favours, "Extend Protection Plan", "Mattress Recycling Fee",
 *          "Serviceability - Side Table Knob", 1000 vinyl record sleeves
 *   20-39  a stone mortar and pestle, a personalised notepad, a money wallet,
 *          a hangover kit, a shoe horn set
 *
 * The second list is gifts. At 40 the penalty took 13.9% of the catalogue and
 * fell hardest on whole categories the prompt's own wording condemns —
 * skincare and coffee as "consumables", chargers and hubs as "accessories
 * useless without the thing they attach to". Olaplex lost 70% of its
 * catalogue, Satechi 62%, Trade Coffee 54%. Those are ordinary gifts.
 *
 * At 20 it takes 6.1%, which is the junk and nothing else.
 */
export const GIFT_SCORE_FLOOR = 20;

/**
 * What a product keeps when it falls below the floor.
 *
 * A multiplier, not a fifth weight. Adding a weight would mean renormalising
 * the other four, which changes the order of every gift in the catalogue to
 * fix a problem with a few hundred of them. This only ever demotes, and only
 * what the model actually flagged.
 *
 * 0.75 is deliberately survivable: a pack of napkins that genuinely matches
 * someone's interests should slide down the page, not vanish. Ranking is not
 * the place to overrule the catalogue.
 */
export const GIFT_SCORE_PENALTY = 0.75;

/**
 * Above this a product is nudged up rather than merely left alone.
 *
 * The floor removes junk; this promotes the genuinely gift-shaped. 13% of the
 * catalogue scores 80 or better, so it is a real top slice rather than a
 * rounding band, and the occasion landing pages already rank on giftScore
 * outright — the quiz had no reason to use only half the signal.
 */
export const GIFT_SCORE_CEILING = 80;
/** Deliberately smaller than the penalty: promoting is riskier than demoting. */
export const GIFT_SCORE_BONUS = 1.05;

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
    affinity: ["Romance", "Jewelry", "Personalized", "Self-care", "Travel", "Bags"],
    avoid: [],
  },
  Friend: {
    affinity: ["Games", "Music", "Fashion", "Outdoors", "Food", "Gaming", "Sneakers", "Pets", "Bags"],
    avoid: ["Romance"],
  },
  Parent: {
    affinity: ["Home Decor", "Cooking", "Gardening", "Self-care", "Reading", "Pets", "Bags"],
    avoid: ["Romance", "Gaming"],
  },
  Sibling: {
    affinity: ["Gaming", "Music", "Fashion", "Games", "Tech", "Sneakers"],
    avoid: ["Romance"],
  },
  Child: {
    affinity: ["Games", "STEM", "Creativity", "Reading", "Art", "Sneakers"],
    avoid: ["Romance", "Beauty", "Jewelry", "Self-care"],
  },
  Coworker: {
    // Low-intimacy, safely impersonal gifts.
    affinity: ["Coffee", "Food", "Home Decor", "Writing"],
    // Sneakers join the list for the same reason Fashion is on it: both need a
    // size, and asking a colleague theirs is the problem.
    avoid: ["Romance", "Jewelry", "Personalized", "Beauty", "Self-care", "Fashion", "Sneakers"],
  },
  Other: { affinity: [], avoid: [] },
};

export interface ScoreInput {
  giftInterests: string[];
  /** The seller, for the recognition nudge. See lib/known-brands.ts. */
  platform?: string;
  /**
   * 0-100 from scripts/score-gifts.ts, or null when the row has never been
   * scored — which is neutral, so a partial run never penalises rows nobody
   * has looked at yet.
   */
  giftScore?: number | null;
  giftPrice: number;
  giftAgeMin: number;
  giftAgeMax: number;
  selectedInterests: string[];
  relationship: string;
  age: number;
  minBudget: number;
  /** Infinity when the user dragged the ceiling to "and up". */
  maxBudget: number;
}

export interface ScoreBreakdown {
  total: number;
  interestMatches: number;
  interest: number;
  relationship: number;
  budget: number;
  age: number;
}

/** How much of the gift's score comes from covering what the shopper asked
 *  for, as opposed to being narrowly about one of those things. */
export const COVERAGE_WEIGHT = 0.85;

/**
 * Thematic fit, as two questions.
 *
 * COVERAGE: how much of what the shopper asked for does this satisfy? Measured
 * against their selection, so every gift is judged by the same yardstick.
 *
 * FOCUS: how much of this gift is about those things? A product tagged only
 * "Home Decor" is more purely that than one tagged with it among four others,
 * and deserves a nudge.
 *
 * The old formula divided by min(selected, giftInterests), which handed a
 * *perfect* score to anything carrying exactly one tag. Pick Sneakers, Cars and
 * Home Decor and a single-tag coffee table scored 1.0 while a sneaker tagged
 * [Sneakers, Fashion, Sports] scored 0.33 — so the shoes never appeared, and
 * the page filled with whatever narrow-tagged item was most expensive. Focus is
 * worth a nudge, not a landslide.
 */
/**
 * Which chip each tag belongs to. Several chips own two tags and send both:
 * "Gaming" is [Gaming, Games], "Art" is [Art, Painting], "Cooking & Food" is
 * [Cooking, Food]. A tag with no chip maps to itself.
 */
const CHIP_OF_TAG = new Map<string, string>(
  INTEREST_CHOICES.flatMap((choice) => choice.tags.map((tag) => [tag, choice.label] as const)),
);

/**
 * The chips a selection represents, cached per request.
 *
 * `selected` is one array shared by every gift in a request, so this is keyed
 * on the array itself: a broad query scores ~13,000 gifts and rebuilding the
 * set inside the loop would be 13,000 allocations to answer the same question.
 * A WeakMap means the entry disappears with the request rather than growing a
 * cache nobody clears.
 */
const CHIPS_WANTED = new WeakMap<string[], Set<string>>();

function chipsWanted(selected: string[]): Set<string> {
  const cached = CHIPS_WANTED.get(selected);
  if (cached) return cached;
  const chips = new Set(selected.map((tag) => CHIP_OF_TAG.get(tag) ?? tag));
  CHIPS_WANTED.set(selected, chips);
  return chips;
}

function interestScore(giftInterests: string[], selected: string[]): number {
  if (selected.length === 0 || giftInterests.length === 0) return 0;
  // Deduplicated: 32 rows carry a repeated tag, and counting one twice both
  // inflates coverage and understates focus.
  const tags = [...new Set(giftInterests)];
  const wanted = new Set(selected);

  // Coverage counts *chips*, not tags. A shopper who ticks "Gaming" ticks one
  // box, but the quiz sends [Gaming, Games], and dividing by the tag count
  // scored a dice set carrying both synonyms 1.0 against 0.5 for a keyboard
  // carrying only Gaming. That is how a Gaming search came back as a page of
  // dice: not because dice fit better, but because Etsy's dice sellers happen
  // to tag both halves of a synonym pair.
  const satisfiedChips = new Set(
    tags.filter((tag) => wanted.has(tag)).map((tag) => CHIP_OF_TAG.get(tag) ?? tag),
  );
  const coverage = satisfiedChips.size / chipsWanted(selected).size;

  // Focus stays per-tag: it asks how much of *this gift* is about the chosen
  // things, and that is a question about the product's own tags.
  const matches = tags.filter((i) => wanted.has(i)).length;
  const focus = matches / tags.length;
  return Math.min(coverage * COVERAGE_WEIGHT + focus * (1 - COVERAGE_WEIGHT), 1);
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
 * Where the price sits inside the chosen band. Something near the top of what
 * someone is willing to spend generally reads as a more considered gift than
 * something scraping the floor, so the sweet spot is the upper-middle of the
 * band. Never penalizes below 0.5 — cheap isn't disqualifying, just less
 * "this was chosen for you".
 *
 * Measured as a fraction of the band's width rather than of the ceiling alone,
 * so the signal still discriminates when the user picks a narrow window: at
 * $150-200, a $190 gift should read as top-of-budget, not as 95% of $200 by
 * coincidence.
 *
 * Uncapped mode (maxBudget === Infinity, ceiling dragged to "and up") means the
 * user asked for premium: score rises linearly with price up to BUDGET_MAX and
 * stays maxed above it, so pricier gifts actively outrank cheaper ones.
 */
function budgetScore(price: number, minBudget: number, maxBudget: number): number {
  if (!Number.isFinite(maxBudget)) {
    return Math.min(price / BUDGET_MAX, 1);
  }

  const span = maxBudget - minBudget;
  // Both thumbs on the same value: anything that survived the SQL filter is
  // exactly on budget, so there is nothing left to discriminate on.
  if (span <= 0) return 1;

  const ratio = (price - minBudget) / span;
  if (ratio < 0 || ratio > 1) return 0; // shouldn't happen (filtered in SQL), but fail safe
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
  const budget = budgetScore(input.giftPrice, input.minBudget, input.maxBudget);
  const age = ageScore(input.giftAgeMin, input.giftAgeMax, input.age);

  const base =
    interest * WEIGHTS.interest +
    relationship * WEIGHTS.relationship +
    budget * WEIGHTS.budget +
    age * WEIGHTS.age;

  const giftable =
    typeof input.giftScore !== "number"
      ? 1
      : input.giftScore < GIFT_SCORE_FLOOR
        ? GIFT_SCORE_PENALTY
        : input.giftScore >= GIFT_SCORE_CEILING
          ? GIFT_SCORE_BONUS
          : 1;
  // A tiebreaker, not a thumb on the scale: see lib/known-brands.ts for why
  // this is 6% and not more.
  const recognised = input.platform && KNOWN_BRANDS.has(input.platform) ? RECOGNITION_BOOST : 1;
  const total = base * giftable * recognised;

  return {
    total,
    interestMatches: [...new Set(input.giftInterests)].filter((i) =>
      input.selectedInterests.includes(i),
    ).length,
    interest,
    relationship,
    budget,
    age,
  };
}

/* ------------------------------------------------------------------ *
 * Diversity
 *
 * Relevance alone produces terrible gift pages. Interests are tagged per
 * brand, so every product from one label scores identically and price becomes
 * the only tiebreaker — which yields twelve Boy Smells candles, or six
 * near-identical gold chains in a row. Both were real outputs before this.
 *
 * So selection is greedy with penalties rather than a plain sort: walk the
 * slots, and each time pick the best remaining candidate *after* discounting
 * it for how much it repeats what's already on the page. Penalties are
 * additive and small, so a genuinely dominant item still wins its slot.
 * ------------------------------------------------------------------ */

/** Per already-selected item from the same platform. */
export const PLATFORM_REPEAT_PENALTY = 0.055;
/**
 * Per already-selected item answering the same chosen interest.
 *
 * Someone who picks three interests is asking to see all three. Without this
 * the whole page answers whichever one happens to score highest — pick
 * Sneakers, Cars and Home Decor and you get 150 pieces of home decor, because
 * every gift matching exactly one interest scores identically and nothing
 * breaks the tie in favour of variety.
 *
 * Small and additive, like the platform penalty, and measured against the
 * *least* represented interest a gift answers, so a gift covering a neglected
 * interest is barely penalised at all.
 */
export const INTEREST_REPEAT_PENALTY = 0.02;

/**
 * Per already-selected item from the same fifth of the chosen budget band.
 *
 * Budget scoring gives a flat 1.0 to anything in the upper half of the band,
 * so when a category's tags are uniform — every sneaker is [Sneakers, Fashion,
 * Sports] — budget is the only term left moving and the page collapses to a
 * price sort. A $75-250 search returned 150 results and not one under $165:
 * the shopper never saw the bottom 60% of their own budget.
 *
 * Spreading across fifths is the same trick as the platform and interest
 * penalties, and it costs nothing when a page is already varied.
 */
export const PRICE_BAND_REPEAT_PENALTY = 0.025;
/**
 * Per already-selected item from the same category.
 *
 * The gap a test user found: a Gaming + Games search for a 22-year-old friend
 * returned 71 gifts of which 27 were dice sets. Nothing in the pass could see
 * it. The platform penalty cannot, because they came from dozens of different
 * Etsy sellers; the interest penalty cannot, because dice answer Gaming and
 * Games exactly as a keyboard or a board game does; and the near-duplicate
 * test cannot, because "Liquid Core Dice Set" and "Cow Dice Set - Polyhedral
 * Dice creature Inside" share two useful tokens out of a dozen and score far
 * under DUPLICATE_SIMILARITY. `category` is the field that knows they are the
 * same idea, and it was the one signal the pass was not using.
 *
 * 0.045, between the platform and interest penalties. Sized against what it is
 * for: a shelf has to be genuinely dominant before this pushes it aside, and
 * the tenth item from one category loses about half of what the tenth item
 * from one seller does. Raising it much past 0.06 starts scattering a page
 * that was legitimately about one thing, which a Gaming search partly is.
 */
export const CATEGORY_REPEAT_PENALTY = 0.045;

/** Applied once if the title is a near-duplicate of something already picked. */
export const NEAR_DUPLICATE_PENALTY = 0.3;
/** Jaccard overlap of title tokens above which two products count as the same idea. */
export const DUPLICATE_SIMILARITY = 0.55;

/** Words that carry no distinguishing meaning in product titles. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "in", "of", "to", "by", "on",
  "gift", "gifts", "set", "box", "kit", "new", "pack", "size", "inch", "inches",
  "handmade", "custom", "personalized", "personalised", "womens", "mens", "women", "men",
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface DiversifiableItem {
  score: number;
  platform: string;
  name: string;
  /** The gift's own interests, used to spread the page across the chosen ones. */
  interests?: string[];
  /** Price, used to spread the page across the shopper's budget. */
  price?: number;
  /** What the thing is, used to stop one shelf taking the page. */
  category?: string | null;
}

/**
 * Greedy re-ranking for variety. Returns indices into `items`, best first.
 *
 * `items` need not be pre-sorted — the first pick is whichever scores highest.
 */
export function selectDiverse<T extends DiversifiableItem>(
  items: T[],
  limit: number,
  /** The shopper's chosen interests. Omit to skip interest balancing. */
  selected: string[] = [],
  /** The chosen budget, for price spread. Omit to skip it. */
  budget?: { min: number; max: number },
): number[] {
  const tokens = items.map((item) => titleTokens(item.name));
  const remaining = new Set(items.map((_, i) => i));
  const chosen: number[] = [];
  const platformCounts = new Map<string, number>();
  const interestCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  // Which of the shopper's interests each gift answers. Computed once.
  const answered = items.map((item) =>
    (item.interests ?? []).filter((i) => selected.includes(i)),
  );

  // Which fifth of the budget each gift sits in. Uncapped searches have no
  // ceiling to divide, so the span falls back to the most expensive candidate.
  const bandCounts = new Map<number, number>();
  const ceiling =
    budget && Number.isFinite(budget.max)
      ? budget.max
      : Math.max(...items.map((i) => i.price ?? 0), budget?.min ?? 0);
  const span = budget ? Math.max(ceiling - budget.min, 1) : 0;
  const bandOf = (price?: number) =>
    budget && typeof price === "number"
      ? Math.min(4, Math.max(0, Math.floor(((price - budget.min) / span) * 5)))
      : -1;

  // Near-duplicate status is monotonic: the chosen set only grows, so once an
  // item duplicates something already picked it can never become distinct
  // again. Recording it once and comparing each round against only the newest
  // pick turns what was a rescan of every pick per candidate per round into a
  // single pass, which is what makes a large result cap affordable.
  const duplicate = new Set<number>();

  while (chosen.length < limit && remaining.size > 0) {
    let bestIndex = -1;
    let bestAdjusted = -Infinity;

    for (const index of remaining) {
      const item = items[index];
      const repeats = platformCounts.get(item.platform) ?? 0;

      // Against the least represented interest this gift answers: covering a
      // neglected one should cost nothing even if it also covers a crowded one.
      const mine = answered[index];
      const interestRepeats = mine.length
        ? Math.min(...mine.map((i) => interestCounts.get(i) ?? 0))
        : 0;

      const band = bandOf(item.price);
      const bandRepeats = band >= 0 ? (bandCounts.get(band) ?? 0) : 0;

      // Uncategorised items are not a shelf. "Everything else" is whatever no
      // rule matched, so counting it as one category would penalise a set of
      // unrelated things for having nothing in common.
      const categoryRepeats = item.category ? (categoryCounts.get(item.category) ?? 0) : 0;

      const adjusted =
        item.score -
        repeats * PLATFORM_REPEAT_PENALTY -
        interestRepeats * INTEREST_REPEAT_PENALTY -
        bandRepeats * PRICE_BAND_REPEAT_PENALTY -
        categoryRepeats * CATEGORY_REPEAT_PENALTY -
        (duplicate.has(index) ? NEAR_DUPLICATE_PENALTY : 0);

      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) break;
    chosen.push(bestIndex);
    remaining.delete(bestIndex);
    const platform = items[bestIndex].platform;
    platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
    for (const i of answered[bestIndex]) interestCounts.set(i, (interestCounts.get(i) ?? 0) + 1);
    const chosenBand = bandOf(items[bestIndex].price);
    if (chosenBand >= 0) bandCounts.set(chosenBand, (bandCounts.get(chosenBand) ?? 0) + 1);
    const chosenCategory = items[bestIndex].category;
    if (chosenCategory) categoryCounts.set(chosenCategory, (categoryCounts.get(chosenCategory) ?? 0) + 1);

    for (const index of remaining) {
      if (!duplicate.has(index) && jaccard(tokens[index], tokens[bestIndex]) >= DUPLICATE_SIMILARITY) {
        duplicate.add(index);
      }
    }
  }

  return chosen;
}

/* ------------------------------------------------------------------ *
 * Similarity
 *
 * Powers "more like this": the shopper has pointed at one product and asked
 * for the same idea again. That is a different question from the quiz, which
 * ranks against a *person*. Here the anchor product is the whole query, so the
 * quiz answers survive only as the hard filters the API route already applies
 * (occasion, age, gender, budget) and the anchor decides the ordering.
 *
 * Pure, like the rest of this file, and cheap enough to stay off the LLM path.
 * ------------------------------------------------------------------ */

export const SIMILARITY_WEIGHTS = {
  /** What the product is *for*. The strongest signal we have per row. */
  interest: 0.5,
  /** What it literally is. Catches "leather journal" ~ "leather notebook"
   *  where the interest tags are identical across a whole category. */
  title: 0.3,
  /** Someone who clicked a $28 candle is not shopping the $180 one. */
  price: 0.15,
  /** Mild: the same maker often really is the nearest thing, but this is
   *  deliberately too small to fill the strip with one brand on its own. */
  platform: 0.05,
} as const;

/**
 * Below this the price signal stops discriminating, so a $4 sticker and a $12
 * one don't read as wildly different products. Also keeps the ratio finite
 * when the anchor is nearly free.
 */
const PRICE_SCALE_FLOOR = 25;

/**
 * At or above this title overlap, two listings are the same product rather
 * than a similar one — usually the same item imported from two sellers, or a
 * size variant. Showing them back as "more like this" reads as a bug.
 *
 * Much higher than DUPLICATE_SIMILARITY, which exists to keep a *varied* page
 * varied. Here near-duplicates are the point, right up until they are the item
 * the shopper is already looking at.
 */
export const SAME_LISTING_SIMILARITY = 0.85;

export interface SimilarityInput {
  anchorInterests: string[];
  anchorTitle: string;
  anchorPrice: number;
  anchorPlatform: string;
  candidateInterests: string[];
  candidateTitle: string;
  candidatePrice: number;
  candidatePlatform: string;
}

export interface SimilarityBreakdown {
  total: number;
  /** Title overlap, exposed so callers can drop the same listing outright. */
  titleOverlap: number;
}

export function scoreSimilarity(input: SimilarityInput): SimilarityBreakdown {
  const interest = jaccard(new Set(input.anchorInterests), new Set(input.candidateInterests));
  const titleOverlap = jaccard(titleTokens(input.anchorTitle), titleTokens(input.candidateTitle));

  // Relative rather than absolute: $10 apart matters on a $20 gift and not on
  // a $200 one.
  const scale = Math.max(input.anchorPrice, PRICE_SCALE_FLOOR);
  const price = 1 - Math.min(Math.abs(input.candidatePrice - input.anchorPrice) / scale, 1);

  const platform = input.candidatePlatform === input.anchorPlatform ? 1 : 0;

  const total =
    interest * SIMILARITY_WEIGHTS.interest +
    titleOverlap * SIMILARITY_WEIGHTS.title +
    price * SIMILARITY_WEIGHTS.price +
    platform * SIMILARITY_WEIGHTS.platform;

  return { total, titleOverlap };
}
