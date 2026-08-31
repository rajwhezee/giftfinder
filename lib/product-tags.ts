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

/** Every shelf the rules can produce, for validation and for the UI's order. */

export interface DerivedTags {
  /** Always a subset of INTERESTS. */
  interests: string[];
  /** Only set when the listing says so outright; otherwise the caller's default. */
  gender?: "male" | "female";
}

interface Rule {
  /** For the importer's summary line, so a misfiring rule is findable. */
  label: string;
  /**
   * The shelf a shopper sees. Several rules share one — bulbs and lamps are
   * both "Lamps" to someone browsing — because the rules are split by what
   * they need to *match*, and that is finer than what anyone wants to filter
   * by.
   */
  category: string;
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
  // --- Product types the rules had no entry for at all ---
  //
  // 46% of the catalogue carried no category, which is not a tagging miss so
  // much as a vocabulary gap: these rules were written against DTC Shopify
  // listings, and Etsy and eBay sell whole classes of thing the list never
  // named. An uncategorised row takes the neutral multiplier in
  // occasionGiftFit, so it can be neither promoted nor demoted, and it lands
  // in "Everything else" on the results filter.
  //
  // First in RULES because each names an object outright. Ordered before the
  // apparel and decor rules so an apron is kitchen rather than clothing and a
  // chocolate box is not a "gift box".
  {
    label: "chocolate & sweets",
    category: "Chocolate & Sweets",
    pattern: /\bchocolates?\b|\btruffles?\b|\bfudge\b|\bbrownies?\b|\bmacarons?\b|\bcandy\b|\bcaramels?\b|\btoffee\b|\bmithai\b|\bconfection/,
    interests: ["Food", "Family"],
  },
  {
    label: "vinyl & records",
    category: "Vinyl & Music",
    pattern: /\bvinyl\b|\blp record\b|\brecord (album|lp)\b|\bcassettes?\b|\bturntables?\b/,
    interests: ["Music"],
  },
  {
    label: "musical instruments",
    category: "Instruments",
    pattern: /\bguitars?\b|\bukuleles?\b|\bviolins?\b|\bharmonicas?\b|\bkalimba\b|\bdrum (kit|set)\b|\bkeyboard piano\b/,
    interests: ["Music", "Creativity"],
  },
  {
    label: "art supplies",
    category: "Art Supplies",
    pattern: /\beasels?\b|\bpaint set\b|\bpaintbrush(es)?\b|\bsketchbooks?\b|\bwatercolou?r set\b|\bacrylic paints?\b|\bart set\b|\bcalligraphy set\b/,
    interests: ["Art", "Creativity", "Painting"],
  },
  {
    label: "toys",
    category: "Toys",
    pattern: /\bplush(ie)?s?\b|\bstuffed animals?\b|\btoy cars?\b|\bwooden toys?\b|\bplay ?sets?\b|\bbuilding blocks?\b|\bdolls?\b|\brattles?\b|\bride[- ]on\b|\bdie[- ]?cast\b/,
    interests: ["Family", "Creativity", "Games"],
  },
  {
    label: "aprons & kitchen linen",
    category: "Kitchen & Drinkware",
    pattern: /\baprons?\b|\btea towels?\b|\boven mitts?\b|\bpot holders?\b|\bplacemats?\b/,
    interests: ["Cooking", "Home Decor"],
  },
  {
    label: "party & celebration decor",
    category: "Party & Celebration",
    pattern: /\bbanners?\b|\bgarlands?\b|\bballoons?\b|\bbunting\b|\bcake toppers?\b|\bparty (decor|supplies|favou?rs)\b|\bconfetti\b/,
    interests: ["Home Decor", "Family", "Creativity"],
  },
  // --- Footwear, in two passes with the apparel rules in between.
  //
  //     This pass is the nouns that can only be a shoe. It runs first so a
  //     "Bondage Belt Sandal" is a sandal rather than a belt.
  //
  //     The lookahead on "shoe" is not fussiness. Shoe Palace prints its own
  //     name into every title it sells, so without it their jackets, hoodies
  //     and jerseys all classify as footwear; any retailer whose name contains
  //     a category word needs the same treatment. The rest of the lookahead is
  //     luggage: a duffel "with shoe compartment" and a backpack tagged "shoe
  //     pocket" are bags, and they were landing in Sneakers.
  //
  //     The model names — air jordan, new balance, air max — are NOT here.
  //     They live in a second pass below apparel, because a sneaker boutique
  //     puts them on jerseys, hoodies, scarves and track pants too: "Air
  //     Jordan x Free The Youth Football Jersey" was being filed under
  //     Sneakers, and so was a New Balance fleece hoodie. An apparel noun has
  //     to beat a brand name, or "Sneakers" stops meaning shoes. ---
  {
    label: "footwear",
    category: "Shoes",
    pattern:
      /\bfootwear\b|\bsneakers?\b|\bshoes?\b(?! palace| compartment| bags?\b| pockets?| organiz)|\btrainers\b|\bcleats\b|\bloafers?\b|\bsandals?\b|\bmules?\b|\bclogs?\b|\bslides?\b|\bmoccasins?\b|\bmocs?\b/,
    interests: ["Sneakers", "Fashion", "Sports"],
  },
  { label: "boots",
    category: "Shoes", pattern: /\bboots?\b/, interests: ["Fashion", "Outdoors"] },

  // --- Pets. High in the table because "dog bed" and "cat tree" would
  //     otherwise be read as furniture, and "dog treats" as food. ---
  {
    label: "pets",
    category: "Pets",
    // "dog tag" is military ID jewellery far more often than pet gear, and
    // Etsy sells a lot of the engraved kind.
    pattern: /\bdogs?\b(?! ?tags?\b)|\bcats?\b|\bpuppy\b|\bkitten\b|\bpets?\b|\bleash(es)?\b|\bcollars? (and|&)? ?leash\b|\bharness\b|\bcanine\b|\bfeline\b/,
    interests: ["Pets", "Family"],
  },

  // --- Audio. Before "tech", which would otherwise swallow it. ---
  {
    label: "audio",
    category: "Headphones & Speakers",
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
    category: "Lamps",
    // "pendant" and "shade" only as light fittings: a pendant *necklace*
    // was filing itself under Lamps, and Etsy sells a lot of them.
    pattern: /\blamps?\b|\bsconce\b|\bchandelier\b|\blantern\b|floor light|table light|pendant (light|lamp|shade)/,
    interests: ["Home Decor", "Reading"],
  },
  {
    label: "smart/RGB lighting",
    category: "Smart Lighting",
    pattern: /\brgb\b|light strip|\blightstrip\b|smart bulb|light panel|neon sign|colou?r[- ]changing|led (display|matrix|panel)|pixel art/,
    interests: ["Tech", "Home Decor", "Gaming"],
  },
  {
    label: "bulbs & fittings",
    category: "Lamps",
    pattern: /\bbulbs?\b|\bled\b/,
    interests: ["Home Decor", "Tech"],
  },
  {
    label: "string & festive lights",
    category: "String Lights",
    pattern: /string lights?|fairy lights?|\bgarland\b|christmas lights?/,
    interests: ["Home Decor", "Creativity"],
  },

  // --- Desk tech ---
  {
    label: "keyboards & input",
    category: "Keyboards",
    // "mouse" needs the guard: a Mickey Mouse bag charm was filing itself
    // under Keyboards.
    pattern: /\bkeyboards?\b|\bkeycaps?\b|(?<!mickey )(?<!minnie )\bmouse\b|\bmousepad\b|\bswitches\b|\btrackpad\b/,
    interests: ["Tech", "Gaming", "Writing"],
  },
  {
    label: "power & charging",
    category: "Chargers & Power",
    pattern: /\bchargers?\b|power bank|\bpowerbank\b|\bcables?\b|charging (pad|stand|dock)|\badapters?\b|\bbatter(y|ies)\b/,
    interests: ["Tech", "Travel"],
  },
  {
    label: "phone & laptop accessories",
    category: "Phone & Laptop",
    pattern: /phone (case|stand|grip|mount)|laptop (stand|sleeve|case)|\btablet stand\b|\bdocks?\b|\bhubs?\b|screen protector/,
    interests: ["Tech"],
  },
  {
    label: "cameras & photography",
    category: "Cameras",
    pattern: /\bcameras?\b|\blens(es)?\b|\btripod\b|\bgimbal\b|instant film/,
    interests: ["Photography", "Creativity"],
  },
  {
    label: "wearables & trackers",
    category: "Watches & Trackers",
    pattern: /smart ?watch|fitness tracker|\bsmartband\b/,
    interests: ["Tech", "Fitness"],
  },
  // Ordinary watches, after the smart ones so those keep their own shelf. 126
  // wristwatches were uncategorised because the only watch rule wanted a
  // fitness tracker.
  {
    label: "watches",
    category: "Watches & Trackers",
    pattern: /\bwrist ?watch(es)?\b|\bautomatic watch(es)?\b|\bmechanical watch(es)?\b|\bquartz watch(es)?\b|\bwatch(es)? for (him|her|men|women)\b|\bdive watch\b|\bchronograph\b/,
    interests: ["Fashion", "Tech"],
  },

  // --- Bags & carry ---
  //
  // Above the home rules, not below them, because colourways collide with
  // furniture words: "CHRISTOS LARGE TOTE | LAWN CHAIR" was reading as a
  // chair, and a $487 tote went into the catalogue tagged Home Decor.
  //
  // Outdoors goes first so a *sleeping* bag isn't luggage. The bare word
  // "bag" is matched deliberately: without it a $1,750 canvas bag from a
  // sneaker boutique fell through to the brand's tags and was filed under
  // Sneakers, which is exactly what these rules exist to prevent.
  {
    label: "outdoors",
    category: "Outdoor Gear",
    pattern: /\btents?\b|\bsleeping bags?\b|\bhiking\b|\bcamping\b|\bcoolers?\b|\bhammock\b/,
    interests: ["Outdoors", "Travel"],
  },
  {
    label: "bags & luggage",
    category: "Bags",
    pattern: /\bbackpacks?\b|\bduffels?\b|\btotes?\b|\bluggage\b|\bsuitcases?\b|\bcarry[- ]on\b|\bcrossbody\b|\bhandbags?\b|\bpouch(es)?\b|\bbags?\b|\bsatchels?\b|\bclutch(es)?\b|\bhobo\b|\bshoulder bag\b|\bweekender\b/,
    interests: ["Bags", "Fashion", "Travel"],
  },
  {
    label: "wallets & small leather",
    category: "Wallets",
    pattern: /\bwallets?\b|\bcard ?holder\b|\bkey ?chain\b|\bkey ?ring\b|\bkey ?organiz(er|ers)\b/,
    interests: ["Fashion", "Personalized"],
  },

  // --- Home ---
  {
    label: "furniture",
    category: "Furniture",
    pattern: /\bsofa\b|\bcouch\b|\bchairs?\b|\bstools?\b|\btables?\b|\bdesks?\b|\bshelv(es|ing)\b|\bbookcase\b|\bottoman\b|\bbench\b|\bbed frame\b|\bdressers?\b|\bnightstand\b/,
    interests: ["Home Decor"],
  },
  {
    label: "storage & organisation",
    category: "Storage",
    pattern: /\bstorage\b|\bbaskets?\b|\bbins?\b|\borganiz(er|ers)\b|\borganis(er|ers)\b|\bhooks?\b|\bracks?\b|\bhampers?\b/,
    interests: ["Home Decor"],
  },
  {
    label: "candles & home fragrance",
    category: "Candles",
    pattern: /\bcandles?\b|\bdiffusers?\b|room spray|\bincense\b/,
    interests: ["Home Decor", "Self-care"],
  },
  {
    label: "kitchen & drinkware",
    category: "Kitchen & Drinkware",
    pattern: /\bmugs?\b|\btumblers?\b|\bglassware\b|\bcookware\b|\bkettles?\b|\bcutting board\b|\bplates?\b|\bbowls?\b|\bflatware\b/,
    interests: ["Cooking", "Home Decor"],
  },
  {
    label: "coffee & tea",
    category: "Coffee & Tea",
    pattern: /\bcoffee\b|\bespresso\b|\bgrinders?\b|\bpour[- ]?over\b|\bfrench press\b|\bteapots?\b|\btea\b/,
    interests: ["Coffee", "Food"],
  },
  {
    label: "rugs, throws & textiles",
    category: "Throws & Textiles",
    pattern: /\brugs?\b|\bthrows?\b|\bblankets?\b|\bcushions?\b|\bpillows?\b|\bduvet\b|\bcurtains?\b|\btowels?\b|\bbathrobes?\b/,
    interests: ["Home Decor", "Self-care"],
  },
  {
    label: "wall art & prints",
    category: "Wall Art",
    // Not a bare "print": "Supercar Back Print Shirt" is a t-shirt, and
    // "print" appears on a large share of Etsy apparel titles.
    pattern: /\bwall art\b|\bposters?\b|\bartwork\b|\bart prints?\b|\bframed print\b|\bpicture frames?\b|\bcanvas (print|art|wall)\b|\bwall print\b|\bwall hanging\b/,
    interests: ["Art", "Home Decor"],
  },
  // Beauty before plants, and "plant" no longer matches "plant-based" — that
  // phrase is on half the bath aisle, and it was filing body wash under
  // Gardening.
  // Ahead of skincare deliberately: RULES is first-match-wins, and the skincare
  // pattern used to carry perfume/cologne/fragrance itself, which shelved an
  // eau de parfum next to body wash. Those three words moved here rather than
  // being matched in both places.
  {
    label: "fragrance",
    category: "Fragrance",
    pattern: /\bfragrances?\b|\bperfumes?\b|\bcolognes?\b|\beau de (parfum|toilette|cologne)\b|\bedp\b|\bedt\b|\bbody mist\b|\bscent(ed)? spray\b/,
    interests: ["Fragrance", "Self-care"],
  },
  {
    label: "skincare & beauty",
    category: "Skincare & Beauty",
    pattern: /\bskincare\b|\bserums?\b|\bmoisturiz(er|ers)\b|\bcleansers?\b|\bbody wash\b|\bsoaps?\b|\blotions?\b|\bshampoo\b|\bconditioner\b|\blip \b|\bmakeup\b/,
    interests: ["Beauty", "Self-care"],
  },
  {
    label: "plants & garden",
    category: "Plants & Garden",
    pattern: /\bplants?\b(?![- ]based)|\bplanters?\b|\bseeds?\b|\bgarden\b|\bsucculent\b/,
    interests: ["Gardening", "Home Decor"],
  },

  // --- Apparel & accessories. Last of the wearables, so footwear, bags and
  //     headwear all get their say first. ---
  {
    label: "headwear",
    category: "Hats",
    pattern: /\bheadwear\b|\bhats?\b|\bcaps?\b|\bbeanies?\b|\bsnapback\b|\bbucket hat\b/,
    interests: ["Fashion"],
  },
  {
    label: "jewellery",
    category: "Jewellery",
    pattern: /\bjewell?ery\b|\bnecklaces?\b|\bbracelets?\b|\bearrings?\b|\brings?\b|\bpendants?\b|\bchains?\b/,
    interests: ["Jewelry", "Fashion"],
  },
  {
    label: "eyewear",
    category: "Sunglasses",
    pattern: /\bsunglasses\b|\beyewear\b|\bglasses\b/,
    interests: ["Fashion", "Travel"],
  },
  {
    label: "apparel",
    category: "Clothing",
    pattern:
      /\bapparel\b|\bt[- ]?shirts?\b|\btees?\b|\bhood(ie|ies)\b|\bsweatshirts?\b|\bcrewnecks?\b|\bjackets?\b|\bcoats?\b|\b\w*pants\b|\b\w*shorts\b|\bjeans\b|\bjoggers?\b|\btracksuits?\b|\bsocks?\b|\bshirts?\b|\bdress(es)?\b|\bskirts?\b|\bsweaters?\b|\bknitwear\b|\bjerseys?\b|\bscarv(es)?\b|\bscarf\b|\bgloves?\b|\bmittens?\b|\bbelts?\b|\bhoodies?\b|\btracksuits?\b|\bfleece\b|\bvests?\b/,
    interests: ["Fashion"],
  },

  // Model names only, and only now that every apparel and accessory rule above
  // has had its say. A title that says "Air Jordan" and nothing else about
  // what the product is, is a shoe.
  {
    label: "footwear (model)",
    category: "Shoes",
    pattern: /\bdunk\b|air jordan|air max|air force|\byeezy\b|\bsamba\b|\bgazelle\b|new balance|\bgel-\w|\bxt-\d/,
    interests: ["Sneakers", "Fashion", "Sports"],
  },

  // --- Everything else worth separating ---
  {
    label: "games & puzzles",
    category: "Games & Puzzles",
    pattern: /\bboard game\b|\bpuzzles?\b|\bcard game\b|\bjigsaw\b|\bdice\b/,
    interests: ["Games", "Family"],
  },
  {
    label: "gaming",
    category: "Gaming",
    pattern: /\bcontrollers?\b|\bconsole\b|\bgaming\b|\bheadset\b/,
    interests: ["Gaming", "Tech"],
  },
  {
    label: "stationery & writing",
    category: "Stationery",
    pattern: /\bnotebooks?\b|\bjournals?\b|\bpens?\b|\bpencils?\b|\bplanners?\b|\bstationery\b/,
    interests: ["Writing", "Creativity"],
  },
  {
    label: "books & reading",
    category: "Books",
    pattern: /\bbooks?\b|\bnovels?\b|\bcookbook\b/,
    interests: ["Reading"],
  },
  {
    label: "fitness",
    category: "Fitness",
    pattern: /\byoga\b|\bdumbbells?\b|\bresistance bands?\b|\bfoam roller\b|\bworkout\b/,
    interests: ["Fitness", "Health"],
  },
];

export const CATEGORIES = [...new Set(RULES.map((r) => r.category))].sort();

/**
 * The interests each shelf implies, merged across the rules that feed it.
 *
 * Lets a stored tag set be sanity-checked against what the product visibly is:
 * a duffel bag tagged [Coffee, Food] shares nothing with what Bags means, and
 * that is a tagging error rather than an unusual product.
 */
export const CATEGORY_INTERESTS: Record<string, string[]> = RULES.reduce(
  (acc, rule) => {
    acc[rule.category] = [...new Set([...(acc[rule.category] ?? []), ...rule.interests])];
    return acc;
  },
  {} as Record<string, string[]>,
);

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
export function deriveTags(
  input: DeriveInput,
): (DerivedTags & { label: string; category: string | null }) | null {
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
      return { interests: rule.interests, gender, label: rule.label, category: rule.category };
    }
  }

  return gender ? { interests: [], label: "gender only", category: null, gender } : null;
}
