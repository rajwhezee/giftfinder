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

const OCCASION_CATEGORIES: Record<string, OccasionFit> = {
  // Things that go in the house, used in the house.
  Housewarming: {
    prefer: [
      "Candles", "Kitchen & Drinkware", "Throws & Textiles", "Lamps", "Storage",
      "Furniture", "Plants & Garden", "Wall Art", "String Lights", "Smart Lighting",
    ],
    unsuited: ["Books", "Shoes", "Clothing", "Hats", "Bags", "Wallets", "Watches & Trackers"],
  },
  Wedding: {
    prefer: [
      "Kitchen & Drinkware", "Throws & Textiles", "Candles", "Wall Art", "Furniture",
      "Jewellery", "Plants & Garden",
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
