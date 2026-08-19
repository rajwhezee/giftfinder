/**
 * Brands most shoppers recognise without being told who they are.
 *
 * Used as a tiebreaker, never as a filter. The catalogue carries 137 makers
 * and the great majority are specialists — that is what lets a Raksha Bandhan
 * or a sneaker search return anything at all. A hard whitelist of these names
 * leaves 19% of the catalogue standing and returns *nothing* for beauty or
 * Raksha Bandhan, which is why this is a nudge instead.
 *
 * Recognition is per-audience and this list cannot capture that: a sneakerhead
 * trusts Bodega more than any name below, and a 55-year-old has never heard of
 * it. So the boost is deliberately small — enough to break a tie between two
 * comparable gifts, never enough to outrank a better match.
 *
 * Etsy and eBay are excluded on purpose. Everyone knows them, but they are
 * marketplaces rather than makers, and they are 31% of the catalogue — boosting
 * them would drown the brands this list exists to surface.
 *
 * Editorial, and meant to be edited. Add a name when you would be comfortable
 * seeing it lead a page.
 */
export const KNOWN_BRANDS = new Set([
  // Tech & audio
  "Anker", "Satechi", "Twelve South", "Native Union", "elago", "MOFT", "Baseus",
  "Skullcandy", "JLab", "Raycon", "Keychron", "Nanoleaf", "LIFX", "Twinkly",
  // Home & kitchen
  "Stanley", "Corkcicle", "Our Place", "Umbra", "Rumpl", "Brightech",
  "Flying Tiger", "Snow Peak", "Barebones", "W&P", "Misen", "Fellow",
  // Beauty
  "Glossier", "Fenty Beauty", "Olaplex", "Tatcha", "Rhode", "Summer Fridays",
  "ILIA", "Kosas", "Starface",
  // Bags & travel
  "Away", "Béis", "CALPAK", "Dagne Dover", "Everlane", "Mansur Gavriel",
  // Toys, games & play
  "Melissa & Doug", "PlanToys", "Exploding Kittens", "Tegu",
  // Wellness
  "Therabody", "Hyperice", "Manduka",
  // Streetwear & sneakers — recognised by the audience that shops them
  "Kith", "Undefeated", "Concepts", "Bodega", "Shoe Palace", "DTLR",
  // Food & drink
  "Hu", "Graza", "Brightland", "Jacobsen Salt Co", "Dandelion Chocolate",
]);

/**
 * Multiplier applied to a known brand's total score.
 *
 * 6%. For reference, falling below the giftability floor costs 25%, and a
 * single platform repeat in the diversity pass costs about 5.5% of a typical
 * total — so this reorders near-ties and nothing else. Raising it much past
 * 1.1 starts letting a familiar name beat a genuinely better match, which is
 * the failure this is trying to avoid.
 */
export const RECOGNITION_BOOST = 1.06;
