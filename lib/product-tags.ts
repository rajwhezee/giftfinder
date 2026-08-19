import { INTERESTS } from "./gift-options";

/**
 * Deterministic per-product tagging from a listing's own words.
 *
 * `enrich:tags` reads a product and judges it; this only matches patterns. It
 * exists because the alternative for an untagged row is the *brand's* tags,
 * which are identical across that brand's whole catalogue — and interests carry
 * 0.55 of the recommendation score directly plus the 0.20 relationship term,
 * which is derived from them. So a brand-tagged row is one where three quarters
 * of the ranking cannot tell any of that brand's products apart: a Dunk and a
 * hoodie from the same shop are the same gift as far as the ranker knows.
 *
 * This does not replace the Claude pass and is not as good as it. It is what a
 * row gets for free until that pass reaches it, and it is deliberately narrow:
 * a rule fires only on wording that leaves little doubt, and anything it
 * doesn't recognise keeps the brand's tags rather than being guessed at.
 *
 * Pure and dependency-free, so it can be reasoned about and tested directly.
 */

export interface DerivedTags {
  /** Always a subset of INTERESTS. */
  interests: string[];
  /** Only set when the listing says so outright; otherwise the caller's default. */
  gender?: "male" | "female";
}

interface Rule {
  /** For the importer's summary line, so a misfiring rule is findable. */
  label: string;
  /** Tested against `${product_type} ${title}`, lowercased. */
  pattern: RegExp;
  interests: string[];
}

/**
 * First match wins, so these run most specific first. The ordering is the
 * whole design: "running shoes" must beat "running", and a lamp must be read
 * as a lamp before "light" catches an LED strip.
 */
const RULES: Rule[] = [
  // --- Footwear, in two passes with the apparel rules in between.
  //
  //     This pass is the nouns that can only be a shoe. It runs first so a
  //     "Bondage Belt Sandal" is a sandal rather than a belt.
  //
  //     The lookahead on "shoe" is not fussiness: Shoe Palace prints its own
  //     name into every title it sells, so without it their jackets, hoodies
  //     and jerseys all classify as footwear. Any retailer whose name contains
  //     a category word will need the same treatment.
  //
  //     The model names — air jordan, new balance, air max — are NOT here.
  //     They live in a second pass below apparel, because a sneaker boutique
  //     puts them on jerseys, hoodies, scarves and track pants too: "Air
  //     Jordan x Free The Youth Football Jersey" was being filed under
  //     Sneakers, and so was a New Balance fleece hoodie. An apparel noun has
  //     to beat a brand name, or "Sneakers" stops meaning shoes. ---
  {
    label: "footwear",
    pattern:
      /\bfootwear\b|\bsneakers?\b|\bshoes?\b(?! palace)|\btrainers\b|\bcleats\b|\bloafers?\b|\bsandals?\b|\bmules?\b|\bclogs?\b|\bslides?\b|\bmoccasins?\b|\bmocs?\b/,
    interests: ["Sneakers", "Fashion", "Sports"],
  },
  { label: "boots", pattern: /\bboots?\b/, interests: ["Fashion", "Outdoors"] },

  // --- Pets. High in the table because "dog bed" and "cat tree" would
  //     otherwise be read as furniture, and "dog treats" as food. ---
  {
    label: "pets",
    pattern: /\bdogs?\b|\bcats?\b|\bpuppy\b|\bkitten\b|\bpets?\b|\bleash(es)?\b|\bcollars? (and|&)? ?leash\b|\bharness\b|\bcanine\b|\bfeline\b/,
    interests: ["Pets", "Family"],
  },

  // --- Audio. Before "tech", which would otherwise swallow it. ---
  {
    label: "audio",
    pattern: /\bheadphones?\b|\bearbuds?\b|\bearphones?\b|\bspeakers?\b|\bsoundbar\b|\bturntable\b/,
    interests: ["Music", "Tech"],
  },

  // --- Lighting, split three ways so a desk lamp, an RGB strip and a spare
  //     bulb stop being one thing.
  //
  //     Fixtures go first and "led" alone no longer implies RGB: almost every
  //     lamp made this decade is an LED lamp, so a bare "led" was pulling
  //     "Sparq Arc LED Floor Lamp" into [Tech, Home Decor, Gaming]. ---
  {
    label: "lamps & fixtures",
    pattern: /\blamps?\b|\bsconce\b|\bpendant\b|\bchandelier\b|\blantern\b|floor light|table light/,
    interests: ["Home Decor", "Reading"],
  },
  {
    label: "smart/RGB lighting",
    pattern: /\brgb\b|light strip|\blightstrip\b|smart bulb|light panel|neon sign|colou?r[- ]changing|led (display|matrix|panel)|pixel art/,
    interests: ["Tech", "Home Decor", "Gaming"],
  },
  {
    label: "bulbs & fittings",
    pattern: /\bbulbs?\b|\bled\b/,
    interests: ["Home Decor", "Tech"],
  },
  {
    label: "string & festive lights",
    pattern: /string lights?|fairy lights?|\bgarland\b|christmas lights?/,
    interests: ["Home Decor", "Creativity"],
  },

  // --- Desk tech ---
  {
    label: "keyboards & input",
    pattern: /\bkeyboards?\b|\bkeycaps?\b|\bmouse\b|\bmousepad\b|\bswitches\b|\btrackpad\b/,
    interests: ["Tech", "Gaming", "Writing"],
  },
  {
    label: "power & charging",
    pattern: /\bchargers?\b|power bank|\bpowerbank\b|\bcables?\b|charging (pad|stand|dock)|\badapters?\b|\bbatter(y|ies)\b/,
    interests: ["Tech", "Travel"],
  },
  {
    label: "phone & laptop accessories",
    pattern: /phone (case|stand|grip|mount)|laptop (stand|sleeve|case)|\btablet stand\b|\bdocks?\b|\bhubs?\b|screen protector/,
    interests: ["Tech"],
  },
  {
    label: "cameras & photography",
    pattern: /\bcameras?\b|\blens(es)?\b|\btripod\b|\bgimbal\b|instant film/,
    interests: ["Photography", "Creativity"],
  },
  {
    label: "wearables & trackers",
    pattern: /smart ?watch|fitness tracker|\bsmartband\b/,
    interests: ["Tech", "Fitness"],
  },

  // --- Home ---
  {
    label: "furniture",
    pattern: /\bsofa\b|\bcouch\b|\bchairs?\b|\bstools?\b|\btables?\b|\bdesks?\b|\bshelv(es|ing)\b|\bbookcase\b|\bottoman\b|\bbench\b|\bbed frame\b|\bdressers?\b|\bnightstand\b/,
    interests: ["Home Decor"],
  },
  {
    label: "storage & organisation",
    pattern: /\bstorage\b|\bbaskets?\b|\bbins?\b|\borganiz(er|ers)\b|\borganis(er|ers)\b|\bhooks?\b|\bracks?\b|\bhampers?\b/,
    interests: ["Home Decor"],
  },
  {
    label: "candles & home fragrance",
    pattern: /\bcandles?\b|\bdiffusers?\b|room spray|\bincense\b/,
    interests: ["Home Decor", "Self-care"],
  },
  {
    label: "kitchen & drinkware",
    pattern: /\bmugs?\b|\btumblers?\b|\bglassware\b|\bcookware\b|\bkettles?\b|\bcutting board\b|\bplates?\b|\bbowls?\b|\bflatware\b/,
    interests: ["Cooking", "Home Decor"],
  },
  {
    label: "coffee & tea",
    pattern: /\bcoffee\b|\bespresso\b|\bgrinders?\b|\bpour[- ]?over\b|\bfrench press\b|\bteapots?\b|\btea\b/,
    interests: ["Coffee", "Food"],
  },
  {
    label: "rugs, throws & textiles",
    pattern: /\brugs?\b|\bthrows?\b|\bblankets?\b|\bcushions?\b|\bpillows?\b|\bduvet\b|\bcurtains?\b|\btowels?\b|\bbathrobes?\b/,
    interests: ["Home Decor", "Self-care"],
  },
  {
    label: "wall art & prints",
    pattern: /\bwall art\b|\bposters?\b|\bprints?\b|\bframes?\b|\bartwork\b/,
    interests: ["Art", "Home Decor"],
  },
  // Beauty before plants, and "plant" no longer matches "plant-based" — that
  // phrase is on half the bath aisle, and it was filing body wash under
  // Gardening.
  {
    label: "skincare & beauty",
    pattern: /\bskincare\b|\bserums?\b|\bmoisturiz(er|ers)\b|\bcleansers?\b|\bbody wash\b|\bsoaps?\b|\blotions?\b|\bshampoo\b|\bconditioner\b|\blip \b|\bmakeup\b|\bfragrance\b|\bperfume\b|\bcologne\b/,
    interests: ["Beauty", "Self-care"],
  },
  {
    label: "plants & garden",
    pattern: /\bplants?\b(?![- ]based)|\bplanters?\b|\bseeds?\b|\bgarden\b|\bsucculent\b/,
    interests: ["Gardening", "Home Decor"],
  },

  // --- Bags & carry ---
  //
  // Outdoors goes first so a *sleeping* bag isn't luggage. The bare word
  // "bag" is matched deliberately: without it a $1,750 canvas bag from a
  // sneaker boutique fell through to the brand's tags and was filed under
  // Sneakers, which is exactly what these rules exist to prevent.
  {
    label: "outdoors",
    pattern: /\btents?\b|\bsleeping bags?\b|\bhiking\b|\bcamping\b|\bcoolers?\b|\bhammock\b/,
    interests: ["Outdoors", "Travel"],
  },
  {
    label: "bags & luggage",
    pattern: /\bbackpacks?\b|\bduffels?\b|\btotes?\b|\bluggage\b|\bsuitcases?\b|\bcarry[- ]on\b|\bcrossbody\b|\bhandbags?\b|\bpouch(es)?\b|\bbags?\b|\bsatchels?\b|\bclutch(es)?\b|\bhobo\b|\bshoulder bag\b|\bweekender\b/,
    interests: ["Bags", "Fashion", "Travel"],
  },
  {
    label: "wallets & small leather",
    pattern: /\bwallets?\b|\bcard ?holder\b|\bkey ?chain\b|\bkey ?ring\b|\bkey ?organiz(er|ers)\b/,
    interests: ["Fashion", "Personalized"],
  },

  // --- Apparel & accessories. Last of the wearables, so footwear, bags and
  //     headwear all get their say first. ---
  {
    label: "headwear",
    pattern: /\bheadwear\b|\bhats?\b|\bcaps?\b|\bbeanies?\b|\bsnapback\b|\bbucket hat\b/,
    interests: ["Fashion"],
  },
  {
    label: "jewellery",
    pattern: /\bjewell?ery\b|\bnecklaces?\b|\bbracelets?\b|\bearrings?\b|\brings?\b|\bpendants?\b|\bchains?\b/,
    interests: ["Jewelry", "Fashion"],
  },
  {
    label: "eyewear",
    pattern: /\bsunglasses\b|\beyewear\b|\bglasses\b/,
    interests: ["Fashion", "Travel"],
  },
  {
    label: "apparel",
    pattern:
      /\bapparel\b|\bt[- ]?shirts?\b|\btees?\b|\bhood(ie|ies)\b|\bsweatshirts?\b|\bcrewnecks?\b|\bjackets?\b|\bcoats?\b|\b\w*pants\b|\b\w*shorts\b|\bjeans\b|\bjoggers?\b|\btracksuits?\b|\bsocks?\b|\bshirts?\b|\bdress(es)?\b|\bskirts?\b|\bsweaters?\b|\bknitwear\b|\bjerseys?\b|\bscarv(es)?\b|\bscarf\b|\bgloves?\b|\bmittens?\b|\bbelts?\b|\bhoodies?\b|\btracksuits?\b|\bfleece\b|\bvests?\b/,
    interests: ["Fashion"],
  },

  // Model names only, and only now that every apparel and accessory rule above
  // has had its say. A title that says "Air Jordan" and nothing else about
  // what the product is, is a shoe.
  {
    label: "footwear (model)",
    pattern: /\bdunk\b|air jordan|air max|air force|\byeezy\b|\bsamba\b|\bgazelle\b|new balance|\bgel-\w|\bxt-\d/,
    interests: ["Sneakers", "Fashion", "Sports"],
  },

  // --- Everything else worth separating ---
  {
    label: "games & puzzles",
    pattern: /\bboard game\b|\bpuzzles?\b|\bcard game\b|\bjigsaw\b|\bdice\b/,
    interests: ["Games", "Family"],
  },
  {
    label: "gaming",
    pattern: /\bcontrollers?\b|\bconsole\b|\bgaming\b|\bheadset\b/,
    interests: ["Gaming", "Tech"],
  },
  {
    label: "stationery & writing",
    pattern: /\bnotebooks?\b|\bjournals?\b|\bpens?\b|\bpencils?\b|\bplanners?\b|\bstationery\b/,
    interests: ["Writing", "Creativity"],
  },
  {
    label: "books & reading",
    pattern: /\bbooks?\b|\bnovels?\b|\bcookbook\b/,
    interests: ["Reading"],
  },
  {
    label: "fitness",
    pattern: /\byoga\b|\bdumbbells?\b|\bresistance bands?\b|\bfoam roller\b|\bworkout\b/,
    interests: ["Fitness", "Health"],
  },
];

/**
 * Explicit only. "Women's Shoes" is a fact about the listing; a floral print is
 * an inference, and guessing here is how a catalogue ends up telling someone
 * what they are allowed to like.
 *
 * It matters commercially too: `/api/recommend` filters
 * `gender: { in: [selected, "unisex"] }`, so anything tagged male or female is
 * invisible to half of all searches. Silence is the safe default.
 */
const WOMENS = /\bwom[ea]n'?s\b|\bladies'?\b|\bfemale\b/;
const MENS = /\bmen'?s\b|\bmens\b|\bmale\b/;

/** Guards the rule table against a typo'd interest reaching the database. */
export function assertRulesValid(): void {
  const unknown = new Set<string>();
  for (const rule of RULES) {
    for (const interest of rule.interests) {
      if (!INTERESTS.includes(interest as never)) unknown.add(`${rule.label}: ${interest}`);
    }
  }
  if (unknown.size) {
    throw new Error(
      `product-tags rules reference interests missing from lib/gift-options.ts — ${[...unknown].join(", ")}`,
    );
  }
}

export interface DeriveInput {
  title: string;
  /** Shopify's `product_type`. The strongest signal when a merchant sets it. */
  productType?: string | null;
  /** Shopify's `tags`, read only as extra words for the same patterns. */
  tags?: string[];
}

/**
 * Returns null when nothing matches, which the caller should read as "keep the
 * brand's tags" rather than as an empty tag set.
 */
export function deriveTags(input: DeriveInput): (DerivedTags & { label: string }) | null {
  const haystack = [input.productType ?? "", input.title, ...(input.tags ?? [])]
    .join(" ")
    .toLowerCase();

  // Womens/mens is independent of category: it still applies to a shoe whose
  // rule fired and to a jacket whose rule didn't.
  let gender: "male" | "female" | undefined;
  const womens = WOMENS.test(haystack);
  const mens = MENS.test(haystack);
  // "Men's and Women's" means neither, not both.
  if (womens && !mens) gender = "female";
  else if (mens && !womens) gender = "male";

  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) {
      return { interests: rule.interests, gender, label: rule.label };
    }
  }

  return gender ? { interests: [], label: "gender only", gender } : null;
}
