/**
 * Spots listings written in a language the site does not serve.
 *
 * Etsy and eBay return sellers' own listings, and a German or French title in
 * an English results grid reads as a broken catalogue — a "Lustige
 * Abschiedskarte für Kollegen" led /gifts/retirement.
 *
 * Precision over recall throughout. A false positive removes a real gift from
 * a catalogue people are shopping, and the entire population is under 1% of
 * rows, so a missed listing costs far less than a wrongly removed one.
 */

/**
 * Words that effectively cannot appear in an English product title. One is
 * enough.
 *
 * Note what is *not* here: "die", "das", "con", "por", "sin", "les", "des" and
 * "una" all occur in English text ("die cast", "sin", "Les Paul"), so they
 * live in the weak list where they need corroboration.
 */
const STRONG =
  /\b(für|geschenk\w*|personalisiert\w*|tasse|kollegen|ruhestand|abschied\w*|gravur|namensgravur|weihnachten|hochzeit|geburtstag|muttertag|vatertag|herren|damen|kinder|handgemacht|inkl|zum|zur|nicht|auch|sehr|über|schöne|kleine|große)\b|\b(avec|pour|sans|cadeau\w*|anniversaire|très|française?)\b|\b(regalo|cumpleaños|personalizado|hecho|bonito)\b|\b(cadeautje|handgemaakt)\b/i;

/**
 * Common function words that also appear in English often enough to be unsafe
 * alone. Two distinct hits is the bar.
 */
const WEAK =
  /\b(und|mit|der|die|das|dem|den|nach|oder|ein|eine|einen|einem|von|vom|ist|sind|wird|werden|aus|bei|auf|dieser|diese)\b|\b(les|des|une|est|sont|dans|avec|leur)\b|\b(para|con|por|una|unos|muy|más|del)\b|\b(voor|met|een|het|van)\b/gi;

/** Two or more distinct weak markers, or any strong one. */
export function looksNonEnglish(title: string): boolean {
  if (STRONG.test(title)) return true;
  const hits = title.match(WEAK);
  if (!hits) return false;
  return new Set(hits.map((h) => h.toLowerCase())).size >= 2;
}
