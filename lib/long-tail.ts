import { INTERESTS } from "@/lib/gift-options";

/**
 * The audience pages: /gifts/diwali/for-the-home, /gifts/birthday/for-gamers.
 *
 * A deliberately short, hand-written list rather than every occasion crossed
 * with every interest. 448 occasion x interest pairs clear 24 quality gifts and
 * 352 clear 60, but inventory is not the test — search language is. The largest
 * pair in the catalogue is Birthday x Fashion at 9,445 gifts, and nobody has
 * ever typed "birthday gifts for fashion". Generating all 352 would be several
 * hundred near-identical grids, which is the definition of a doorway page and
 * is demoted as one.
 *
 * So each entry here has to be a phrase a person would actually search, and
 * carry enough stock to fill a page that does not simply repeat its parent.
 * The list starts at fifteen on purpose: ship it, wait for Search Console, and
 * only widen if Google indexes these rather than filing them under "Crawled -
 * currently not indexed".
 */

export interface Audience {
  /** URL segment, after `for-`. */
  slug: string;
  /** Reads after "gifts for": "gifts for home cooks". Lower case. */
  label: string;
  /** The same phrase inside a Title Case <title>. Spelled out rather than
   *  capitalised by rule, which turned "the home" into "The Home". */
  titleLabel: string;
  /** Tags any gift must carry one of. Several audiences own a synonym pair,
   *  for the same reason the quiz chips do — see CHIPS_WANTED in lib/ranking. */
  interests: string[];
}

export const AUDIENCES: readonly Audience[] = [
  { slug: "gamers", titleLabel: "Gamers", label: "gamers", interests: ["Gaming", "Games"] },
  { slug: "home-cooks", titleLabel: "Home Cooks", label: "home cooks", interests: ["Cooking", "Food"] },
  { slug: "coffee-lovers", titleLabel: "Coffee Lovers", label: "coffee lovers", interests: ["Coffee"] },
  { slug: "readers", titleLabel: "Readers", label: "readers", interests: ["Reading"] },
  { slug: "tech-lovers", titleLabel: "Tech Lovers", label: "tech lovers", interests: ["Tech"] },
  // Not a person, and kept anyway: "diwali gifts for the home" is how people
  // search for this, and Home Decor is the deepest tag on almost every
  // cultural festival in the catalogue.
  { slug: "the-home", titleLabel: "the Home", label: "the home", interests: ["Home Decor"] },
] as const;

/**
 * Occasion, audience. Every pair was checked against live inventory for at
 * least 60 gifts clearing the landing-page quality bar with a working photo.
 *
 * Weighted towards cultural festivals rather than split evenly. Birthday and
 * Christmas are the two most contested queries on the web and this domain will
 * not place for them soon; "onam gifts for the home" is a query a new site can
 * actually win, and covering those occasions at all is the site's whole claim.
 */
export const AUDIENCE_PAIRS: readonly { occasion: string; audience: string }[] = [
  { occasion: "Birthday", audience: "gamers" },
  { occasion: "Birthday", audience: "coffee-lovers" },
  { occasion: "Birthday", audience: "home-cooks" },
  { occasion: "Birthday", audience: "readers" },
  { occasion: "Birthday", audience: "tech-lovers" },

  { occasion: "Christmas", audience: "gamers" },
  { occasion: "Christmas", audience: "home-cooks" },
  { occasion: "Christmas", audience: "coffee-lovers" },
  { occasion: "Christmas", audience: "the-home" },

  // Six of the fifteen are cultural festivals. Two obvious-looking pairs were
  // cut here after measurement rather than on taste: Diwali x the-home
  // repeated its parent page by 63% and Eid al-Fitr x the-home by 75%, because
  // Home Decor is most of what those occasions carry, so the child page would
  // have been the parent with a different title. Nowruz x the-home (88%) and
  // Hanukkah x the-home (100%) failed the same way.
  { occasion: "Diwali", audience: "home-cooks" },
  { occasion: "Lunar New Year", audience: "tech-lovers" },
  { occasion: "Lunar New Year", audience: "gamers" },
  { occasion: "Eid al-Fitr", audience: "home-cooks" },
  { occasion: "Onam", audience: "the-home" },
  { occasion: "Nowruz", audience: "home-cooks" },
] as const;

const BY_SLUG = new Map(AUDIENCES.map((a) => [a.slug, a]));

export function audienceBySlug(slug: string): Audience | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Every interest named above must exist, or the page silently returns nothing. */
for (const audience of AUDIENCES) {
  for (const interest of audience.interests) {
    if (!(INTERESTS as readonly string[]).includes(interest)) {
      throw new Error(`Unknown interest "${interest}" on audience "${audience.slug}"`);
    }
  }
}

for (const pair of AUDIENCE_PAIRS) {
  if (!BY_SLUG.has(pair.audience)) {
    throw new Error(`Unknown audience "${pair.audience}" for occasion "${pair.occasion}"`);
  }
}
