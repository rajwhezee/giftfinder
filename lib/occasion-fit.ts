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
