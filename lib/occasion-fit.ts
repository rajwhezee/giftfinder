/**
 * Catches products filed under an occasion they visibly do not belong to.
 *
 * Occasions come from the import query, not from the product, so a listing
 * that surfaced in a Valentine's search keeps that tag even when its own title
 * says otherwise: 76 Valentine's-tagged rows have "birthday" in the name, and
 * a "Custom Face Birthday Banner" was leading /gifts/valentines-day.
 *
 * Deliberately narrow. It only fires when the title names a *different*
 * occasion and not this one, so "Birthday & Anniversary Gift" stays on both
 * pages. Guessing beyond that would start hiding good products over a word.
 */

const OCCASION_WORDS: Record<string, RegExp> = {
  Birthday: /\bbirthdays?\b|\b\d{1,3}(st|nd|rd|th) birthday\b/i,
  Christmas: /\bchristmas\b|\bxmas\b|\bsanta\b|\badvent\b/i,
  Wedding: /\bweddings?\b|\bbridal\b|\bbride\b|\bgroom\b|\bbridesmaids?\b/i,
  Anniversary: /\banniversar(y|ies)\b/i,
  Graduation: /\bgraduations?\b|\bgrad\b|\bclass of \d{4}\b/i,
  // The apostrophe is the whole game here: these titles are written
  // "Mother's Day", and a pattern of `mothers? day` matches neither that nor
  // "Mothers' Day". A Mother's Day chocolate reached the Valentine's page
  // through exactly this gap.
  "Mother's Day": /\bmother'?s?'? day\b|\bmum\b|\bmom\b/i,
  "Father's Day": /\bfather'?s?'? day\b|\bdad\b/i,
  "Valentine's Day": /\bvalentine'?s?'?\b|\bvalentinstag\b/i,
  "Baby Shower": /\bbaby shower\b|\bnewborn\b|\bchristening\b/i,
  Halloween: /\bhalloween\b/i,
  Easter: /\beaster\b/i,
  Retirement: /\bretirement\b|\bretiring\b/i,
  Hanukkah: /\bhanukkah\b|\bchanukah\b/i,
  Diwali: /\bdiwali\b/i,
  "Lunar New Year": /\blunar new year\b|\bchinese new year\b/i,
  "Raksha Bandhan": /\brakhi\b|\braksha bandhan\b/i,

  // The remaining occasions, added when "Just Because" made the gap visible.
  //
  // Every other page is narrowed by its own tag first, so an untagged occasion
  // could only leak between two pages that already shared a tag. "Just Because"
  // applies no tag filter at all, which puts the entire catalogue in scope and
  // turns each missing pattern into a real leak: a Bar Mitzvah tzitzit set led
  // the page on the first render.
  //
  // Whole-word throughout, and deliberately not clever. "Holi" does not match
  // "holiday" because the boundary fails on the "d"; "Onam" does not match
  // "monogram" for the same reason at the front.
  Housewarming: /\bhousewarming\b|\bnew home\b/i,
  // "Lunar New Year" also contains "new year", so a lunar product matches both.
  // That is harmless: each page keeps what names its own occasion, and only a
  // page naming neither drops it.
  "New Year": /\bnew year'?s?\b|\bnye\b/i,
  "Family Gathering": /\bfamily (gathering|reunion)\b/i,
  "Get Well Soon": /\bget well( soon)?\b|\bfeel better\b/i,
  "Thank You": /\bthank you\b|\bthankyou\b|\bteacher appreciation\b/i,
  Holi: /\bholi\b/i,
  // Both Eids share the bare word, so each keeps its own products and only a
  // page naming neither loses them.
  "Eid al-Fitr": /\beid\b|\beid al[- ]?fitr\b|\bramadan\b/i,
  "Eid al-Adha": /\beid\b|\beid al[- ]?adha\b|\bqurbani\b/i,
  Passover: /\bpassover\b|\bpesach\b|\bseder\b/i,
  "Mid-Autumn Festival": /\bmid[- ]?autumn\b|\bmooncakes?\b/i,
  Nowruz: /\bnowruz\b|\bnorooz\b|\bnavroz\b/i,
  Vaisakhi: /\bvaisakhi\b|\bbaisakhi\b/i,
  Onam: /\bonam\b/i,
  // Accent-optional: titles are written both ways. Not the bare "quince" —
  // that is a fruit, and it would pull quince jam and candles off every page.
  "Quinceañera": /\bquincea(ñ|n)era\b/i,
  "Day of the Dead": /\bday of the dead\b|\bd[ií]a de (los )?muertos\b/i,
  Kwanzaa: /\bkwanzaa\b/i,
  "St. Patrick's Day": /\bst\.? ?patrick'?s?\b|\bshamrock\b/i,
  Oktoberfest: /\boktoberfest\b/i,
  // "Carnival glass" is a collectible glassware type, not the festival, and it
  // is common enough on Etsy to be worth the negative lookahead.
  Carnival: /\bcarnival\b(?! glass)|\bmardi gras\b/i,
  Vesak: /\bvesak\b|\bwesak\b/i,
  "Bar/Bat Mitzvah": /\b(bar|bat) mitzvah\b|\bmitzvah\b|\btzitzit\b/i,
};

/**
 * True when the title clearly announces some other occasion.
 *
 * Halloween and Easter are not in OCCASIONS — they are only ever the "other"
 * side of this test, which is the point: an Easter egg on a Valentine's page
 * is exactly the sort of thing that slips through.
 */
export function namesADifferentOccasion(title: string, occasion: string): boolean {
  const own = OCCASION_WORDS[occasion];
  if (own?.test(title)) return false;

  for (const [name, pattern] of Object.entries(OCCASION_WORDS)) {
    if (name !== occasion && pattern.test(title)) return true;
  }
  return false;
}


/* ------------------------------------------------------------------ *
 * Occasion suitability
 *
 * `giftScore` asks "is this a good gift", which is occasion-blind by design —
 * so a special-edition Wuthering Heights scores in the nineties and led
 * /gifts/housewarming, /gifts/wedding and /gifts/anniversary at once. It is a
 * lovely present. It is not a housewarming present, because a housewarming
 * present is something that goes in the house.
 *
 * This is the missing question: does what the thing *is* suit why the shopper
 * is buying. Category answers it, and nothing else in the ranking does.
 *
 * EDITORIAL, like RELATIONSHIP_AFFINITY in lib/ranking.ts. These are human
 * judgments about custom, not facts derived from data, and they are the first
 * thing to revisit when an occasion page reads oddly. Occasions absent from the
 * table are deliberately neutral: a birthday or Christmas gift can be anything,
 * and inventing preferences for them would narrow the catalogue for no reason.
 * ------------------------------------------------------------------ */

interface OccasionFit {
  /** What people actually give for this, and what belongs at the top. */
  prefer: string[];
  /** Not wrong, just not what this occasion is for. Demoted, never removed. */
  unsuited: string[];
}

/**
 * Occasions where a crude product title is a trust problem rather than a
 * matter of taste.
 *
 * A randomised sweep of the quiz put a perfume called "SLUT FOR OCTOBER" at
 * position four on the Hanukkah page. Nothing was wrong with the ranking - the
 * product scores well and carried the occasion tag from its brand - but a
 * religious festival page is not where a shopper forgives that, and it costs
 * more trust than any single result can earn back.
 *
 * The religious and family festivals, plus the coming-of-age occasions, which
 * are largely shopped for by parents and grandparents.
 */
const SENSITIVE_OCCASIONS = new Set([
  "Diwali", "Holi", "Onam", "Vaisakhi", "Raksha Bandhan", "Eid al-Fitr", "Eid al-Adha",
  "Lunar New Year", "Mid-Autumn Festival", "Nowruz", "Passover", "Hanukkah", "Kwanzaa",
  "Vesak", "Day of the Dead", "Christmas", "Easter",
  "Bar/Bat Mitzvah", "Quinceañera", "Baby Shower", "Family Gathering", "Mother's Day",
  "Father's Day", "Get Well Soon", "Thank You", "Wedding",
]);

/**
 * Deliberately narrow: strong profanity and explicit words only, whole-word,
 * so it cannot fire on an innocent title. It is not a decency filter for the
 * catalogue - "Bigfoot Hanukkah Ornament" is fine and stays - it is a guard on
 * the handful of pages where the wrong word ends the visit.
 *
 * Whole-word matching matters more than the list does. "ass" would take
 * "Assam tea" and a "glass" is not a slur; each entry here is bounded.
 */
const PROFANITY =
  /\b(fuck\w*|shit\w*|bitch\w*|slut\w*|whore\w*|cunt\w*|dick|cock|tits|boobs?|horny|orgasm\w*|sex(y|ual)?|nsfw|nude)\b/i;

/**
 * Whether this title should be kept off this occasion's page.
 *
 * Filters rather than demotes, unlike everything else in this file. A
 * multiplier would only push it down the grid, and one scroll still lands on
 * it; the point is that it does not appear on that page at all. It stays in
 * the catalogue and on every other occasion.
 */
export function tooCrudeForOccasion(title: string, occasion: string): boolean {
  return SENSITIVE_OCCASIONS.has(occasion) && PROFANITY.test(title);
}

/**
 * The gift that *is* the occasion, matched on the title rather than the
 * category.
 *
 * Categories cannot express this. A rakhi and a friendship bracelet are both
 * Jewellery; a diya and a scented candle are both Candles. On the regional
 * pages that difference is the whole point: after the cultural imports landed,
 * Raksha Bandhan was 69% culturally apt and Diwali 29%, and nothing in the
 * ranking preferred the rakhi to the candle sitting next to it.
 *
 * So this is a two-tier order, which is what people actually shop: first the
 * traditional gift for the occasion, then ordinary presents - a candle, a
 * cutlery set, a bag - which OCCASION_CATEGORIES below handles. On
 * /api/recommend the second tier is already narrowed by the recipient's age
 * and gender, so it lands demographically. The landing pages have no
 * recipient, so there it is occasion alone.
 *
 * Written narrowly and against the words these listings actually use. Each
 * pattern names the object, not the culture: "indian" would match a thousand
 * unrelated things, "rakhi" matches a rakhi.
 */
const OCCASION_SIGNATURE: Record<string, RegExp> = {
  "Raksha Bandhan": /\brakhi\b|\braksha bandhan\b|\bmauli\b|\blumba\b/i,
  Diwali: /\bdiyas?\b|\brangoli\b|\bpooja\b|\bpuja\b|\baarti\b|\bthali\b|\btoran\b|\blakshmi\b|\bmithai\b/i,
  Holi: /\bholi\b|\bgulal\b|\bpichkari\b/i,
  Onam: /\bonam\b|\bkasavu\b|\bsadya\b|\bkerala\b/i,
  Vaisakhi: /\bvaisakhi\b|\bbaisakhi\b|\bkhanda\b|\bik onkar\b|\bgutka\b|\bkara\b/i,
  "Eid al-Fitr": /\beid\b|\btasbih\b|\battar\b|\bquran\b|\bprayer mat\b|\bcrescent\b|\bislamic\b/i,
  "Eid al-Adha": /\beid\b|\btasbih\b|\bquran\b|\bprayer mat\b|\bqurbani\b|\bislamic\b/i,
  "Lunar New Year": /\bred envelopes?\b|\bhongbao\b|\blion dance\b|\bzodiac\b|\bcheongsam\b|\bqipao\b/i,
  "Mid-Autumn Festival": /\bmooncakes?\b|\blanterns?\b|\bmid-autumn\b/i,
  Nowruz: /\bnowruz\b|\bhaft[- ]?se[ie]n\b|\bsabzeh\b|\bpersian\b/i,
  "Quinceañera": /\bquincea\w*\b|\btiara\b|\bsash\b|\brosary\b/i,
  "Day of the Dead": /\bcatrina\b|\bcalaveras?\b|\bpapel picado\b|\bmarigold\b|\bofrenda\b|\bd[ií]a de los muertos\b/i,
  "St. Patrick's Day": /\bcladdagh\b|\bshamrocks?\b|\bceltic knot\b|\baran\b|\btrinity knot\b|\bharp\b/i,
  Oktoberfest: /\bsteins?\b|\bdirndl\b|\blederhosen\b|\bbavarian\b|\bpretzels?\b/i,
  Passover: /\bseder\b|\bmatzah\b|\bmatzo\b|\bhaggadah\b|\bpesach\b/i,
  Hanukkah: /\bmenorahs?\b|\bdreidels?\b|\bhanukkah\b|\bchanukah\b|\bmenorah\b/i,
  "Bar/Bat Mitzvah": /\btallit\b|\bkiddush\b|\btorah\b|\bmitzvah\b|\bkippah\b|\byarmulke\b/i,
  Kwanzaa: /\bkinara\b|\bkente\b|\badinkra\b|\bkwanzaa\b|\bmudcloth\b/i,
  Vesak: /\bvesak\b|\bbuddhas?\b|\blotus\b|\bmala\b|\bincense\b/i,
  Carnival: /\bcarnival\b|\bmasquerade\b|\bsamba\b|\bfeather mask\b/i,
};

/**
 * Applied when the title names the occasion's own gift. Larger than the
 * category boost on purpose: a rakhi should lead the Raksha Bandhan page even
 * when a generically better-scoring present is available, because the shopper
 * came for a rakhi. Still a multiplier rather than a hard sort, so a weak
 * product does not outrank a strong one on the strength of one word.
 */
export const OCCASION_SIGNATURE_BOOST = 1.6;

/** Whether the title names the traditional gift for this occasion. */
export function namesTheOccasionsGift(title: string, occasion: string): boolean {
  const pattern = OCCASION_SIGNATURE[occasion];
  return pattern ? pattern.test(title) : false;
}

const OCCASION_CATEGORIES: Record<string, OccasionFit> = {
  // The regional occasions split on who the festival is for, which changes
  // what the second tier should be.
  //
  // Diwali, Holi, Eid, Lunar New Year and the rest are celebrated with the
  // family and in the house, so once the traditional gift is exhausted what
  // people give is for the household: cookware, a set of dishes, textiles, a
  // lamp. The personal occasions below are the opposite - a Quinceañera or a
  // Bar Mitzvah honours one person, and the gift is theirs.
  ...Object.fromEntries(
    [
      "Diwali", "Holi", "Onam", "Vaisakhi", "Raksha Bandhan", "Lunar New Year",
      "Mid-Autumn Festival", "Nowruz", "Eid al-Fitr", "Eid al-Adha", "Passover",
      "Hanukkah", "Kwanzaa",
    ].map((occasion) => [
      occasion,
      {
        prefer: [
          "Kitchen & Drinkware", "Appliances", "Throws & Textiles", "Candles", "Wall Art",
          "Storage", "Lamps", "Plants & Garden", "Furniture", "Coffee & Tea", "Games & Puzzles",
        ],
        unsuited: [
          "Gaming", "Keyboards", "Chargers & Power", "Phone & Laptop", "Pets",
          "Outdoor Gear", "Shoes", "Hats",
          // Chocolate outranked the cookware on Diwali: three luxury chocolate
          // drawers scored high generally and nothing said they were the wrong
          // shape for the page. Traditional sweets are unaffected, because the
          // signature pattern catches mithai and 1.6 x 0.8 still nets a
          // promotion - it is the generic gift-box chocolate this demotes.
          "Chocolate & Sweets",
        ],
      },
    ]),
  ),
  // Occasions that honour one person rather than a household.
  ...Object.fromEntries(
    [
      "Quinceañera", "Bar/Bat Mitzvah", "Day of the Dead", "St. Patrick's Day",
      "Oktoberfest", "Carnival", "Vesak",
    ].map((occasion) => [
      occasion,
      {
        prefer: [
          "Jewellery", "Fragrance", "Skincare & Beauty", "Bags", "Wall Art", "Candles",
          "Clothing", "Watches & Trackers",
        ],
        unsuited: [
          "Gaming", "Keyboards", "Chargers & Power", "Phone & Laptop", "Pets",
          "Storage", "Furniture",
        ],
      },
    ]),
  ),
  // Things that go in the house, used in the house.
  Housewarming: {
    prefer: [
      "Candles", "Kitchen & Drinkware", "Appliances", "Throws & Textiles", "Lamps",
      "Storage", "Furniture", "Plants & Garden", "Wall Art", "String Lights", "Smart Lighting",
    ],
    unsuited: ["Books", "Shoes", "Clothing", "Hats", "Bags", "Wallets", "Watches & Trackers"],
  },
  Wedding: {
    prefer: [
      "Kitchen & Drinkware", "Appliances", "Throws & Textiles", "Candles", "Wall Art",
      "Furniture", "Jewellery", "Plants & Garden",
    ],
    unsuited: ["Shoes", "Gaming", "Keyboards", "Chargers & Power", "Phone & Laptop", "Hats"],
  },
  Anniversary: {
    prefer: ["Jewellery", "Candles", "Wall Art", "Watches & Trackers", "Kitchen & Drinkware"],
    unsuited: ["Storage", "Chargers & Power", "Phone & Laptop", "Outdoor Gear", "Pets"],
  },
  "Valentine's Day": {
    prefer: ["Jewellery", "Candles", "Skincare & Beauty", "Wall Art", "Coffee & Tea"],
    unsuited: ["Storage", "Chargers & Power", "Keyboards", "Outdoor Gear", "Furniture"],
  },
  "Baby Shower": {
    prefer: ["Throws & Textiles", "Games & Puzzles", "Books", "Wall Art", "Storage"],
    unsuited: ["Shoes", "Gaming", "Keyboards", "Coffee & Tea", "Chargers & Power"],
  },
  Graduation: {
    prefer: [
      "Bags", "Watches & Trackers", "Stationery", "Chargers & Power", "Phone & Laptop",
      "Headphones & Speakers",
    ],
    unsuited: ["Furniture", "Pets", "Candles", "Throws & Textiles"],
  },
  Retirement: {
    prefer: [
      "Plants & Garden", "Books", "Coffee & Tea", "Outdoor Gear", "Kitchen & Drinkware",
      "Wall Art",
    ],
    unsuited: ["Gaming", "Keyboards", "Phone & Laptop", "Hats", "Shoes"],
  },
};

/** Applied to a preferred category. Enough to lead a page, not to overrule a
 *  much better gift. */
export const OCCASION_PREFER_BOOST = 1.18;
/** Applied to an unsuited one. Demotes rather than hides: a book is still a
 *  fine housewarming gift, it just should not be the first thing on the page. */
export const OCCASION_UNSUITED_PENALTY = 0.8;

/**
 * The useful-thing-for-the-house categories, as opposed to the pleasant ones.
 *
 * The full prefer list is too broad to trigger a reservation on: it contains
 * Candles and Wall Art, which are abundant and score well, so "does the page
 * already show a preferred category" was true almost everywhere and the
 * reservation never fired. These two are what someone means by a household
 * gift - an air fryer, a cutlery set - and what the scorer will never rank.
 */
export const HOUSEHOLD_ESSENTIALS = ["Appliances", "Kitchen & Drinkware"];

/** The categories this occasion prefers, or none if it has no entry. */
export function preferredCategoriesFor(occasion: string): string[] {
  return OCCASION_CATEGORIES[occasion]?.prefer ?? [];
}

/**
 * The floor a preferred-category product must clear to be exempted from the
 * landing page's usual quality bar.
 *
 * Low, because the scorer judges a gift by how it reads to unwrap and an
 * appliance never reads well: the 46 air fryers score a median of 26 against a
 * landing floor of 55. That is the scorer working correctly and it is also not
 * what someone shopping a housewarming or a Diwali wants to be told. This lets
 * the useful thing onto the page it belongs on without lowering the bar
 * anywhere else.
 */
export const MIN_PREFERRED_SCORE = 20;

/**
 * The full ranking multiplier for a product on an occasion page: the
 * traditional gift first, then ordinary presents that suit the occasion.
 *
 * Call this rather than occasionCategoryFit directly. The two compose - a
 * brass diya is both the signature gift and a preferred category - which is
 * correct, because that really is the single most appropriate thing on the
 * page.
 */
export function occasionGiftFit(
  occasion: string,
  title: string,
  category: string | null,
): number {
  const signature = namesTheOccasionsGift(title, occasion) ? OCCASION_SIGNATURE_BOOST : 1;
  return signature * occasionCategoryFit(occasion, category);
}

/** Multiplier for how well a category suits an occasion. 1 when either is
 *  unknown, which is most of the catalogue and the correct default. */
export function occasionCategoryFit(occasion: string, category: string | null): number {
  if (!category) return 1;
  const fit = OCCASION_CATEGORIES[occasion];
  if (!fit) return 1;
  if (fit.prefer.includes(category)) return OCCASION_PREFER_BOOST;
  if (fit.unsuited.includes(category)) return OCCASION_UNSUITED_PENALTY;
  return 1;
}
