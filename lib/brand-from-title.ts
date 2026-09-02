/**
 * Recovering a brand name from a marketplace listing title.
 *
 * eBay's Browse API does not carry one. `item_summary/search` has no `brand`
 * field at any `fieldgroups` value, and `/item/{id}`, which does, answers 403
 * for a free client-credentials keyset. Checked 2026-09-02; do not spend the
 * afternoon on it again. The title is the only place the brand exists, and on
 * eBay it is nearly always the first thing in it.
 *
 * This is deliberately a vocabulary rather than a heuristic. "First capitalised
 * word" gives you NEW, NWT, REAL, 18", Vintage and Authentic, all of which lead
 * real listings in this catalogue. A list only ever returns a name someone
 * actually chose to put in it, and returning null is a perfectly good answer:
 * a "High-Power 2400W Smoothie Blender" has no brand, and calling it eBay is
 * the honest label.
 *
 * Etsy is out of scope on purpose. Those listings are independent sellers with
 * no brand at all, and Etsy silently ignores the `includes=Shop` parameter that
 * would give shop names for free (the same trap `lib/etsy.ts` documents for
 * Images), so a shop name would cost a call per shop and still only be a seller
 * handle. Etsy rows keep saying Etsy.
 */

/**
 * Names that are also ordinary English words, or that sit inside other brand
 * names. Matched only at the very start of a title, where eBay sellers put the
 * brand, so "Shark" catches "Shark AI Robot Vacuum" but not "Shark Tank Style
 * Kitchen Gadget", and "Essentials" cannot fire on "Essentials Oil Diffuser".
 */
const LEADING_ONLY = new Set([
  "Apple", "Beats", "Champion", "Dash", "Essentials", "Ring", "Shark", "Sony",
  "Polaroid", "Columbia", "Presto", "Element", "Hoover",
  "Beautiful", "Made In", "Aroma", "Orient", "Guess", "Palace", "Cross", "Pilot",
]);

/**
 * Alternate spellings that should report as one brand. The key is what appears
 * in titles, the value is what the card shows.
 */
const ALIASES: Record<string, string> = {
  "a bathing ape": "BAPE",
  "louis vuitton": "Louis Vuitton",
  "lv": "Louis Vuitton",
  "ysl": "Saint Laurent",
  "yves saint laurent": "Saint Laurent",
  "cdg": "Comme des Garçons",
  "comme des garcons": "Comme des Garçons",
  "the north face": "The North Face",
  "north face": "The North Face",
  "black and decker": "Black+Decker",
  "black & decker": "Black+Decker",
  "crock pot": "Crock-Pot",
  "instant pot": "Instant Pot",
  "air jordan": "Air Jordan",
  "jordan retro": "Air Jordan",
  "levis": "Levi's",
  "melissa and doug": "Melissa & Doug",
  "ecovacs deebot": "ECOVACS",
  "deebot": "ECOVACS",
  "roomba": "iRobot",
  "delonghi": "De'Longhi",
  "de longhi": "De'Longhi",
  "granite stone": "Granitestone",
  "bella pro": "Bella Pro",
  "power xl": "PowerXL",
  "powerxl": "PowerXL",
  "irobot roomba": "iRobot",
};

/**
 * The vocabulary, grouped by the eBay query manifest it exists to serve. Adding
 * a query to `scripts/import-ebay.ts` usually means adding its makers here, or
 * that whole shelf reads as "eBay" on the results page.
 */
const BRANDS = [
  // Hype, streetwear and collectibles
  "KAWS", "Bearbrick", "Medicom", "Travis Scott", "Cactus Jack", "Air Jordan", "Jordan",
  "Yeezy", "Off-White", "Chrome Hearts", "BAPE", "A Bathing Ape", "Supreme", "Fear of God",
  "Denim Tears", "Hellstar", "Stussy", "Palace", "Kith", "Anti Social Social Club",
  "Comme des Garçons", "Sp5der", "Corteiz", "Rhude", "Amiri", "Gallery Dept",

  // Sneakers and footwear
  "Nike", "Adidas", "New Balance", "ASICS", "Converse", "Vans", "Puma", "Reebok",
  "Salomon", "HOKA", "On Running", "Crocs", "Birkenstock", "UGG", "Dr. Martens",
  "Timberland", "Clarks", "Sperry", "Saucony", "Brooks", "Veja", "Onitsuka Tiger",

  // Designer bags, apparel and accessories
  "Coach", "Michael Kors", "Kate Spade", "Tory Burch", "Marc Jacobs", "Longchamp",
  "Louis Vuitton", "Gucci", "Prada", "Burberry", "Balenciaga", "Versace", "Fendi",
  "Dior", "Celine", "Saint Laurent", "Bottega Veneta", "Loewe", "Goyard", "Mulberry",
  "Ralph Lauren", "Polo Ralph Lauren", "Lacoste", "Tommy Hilfiger", "Calvin Klein",
  "Levi's", "Carhartt", "Patagonia", "The North Face", "Under Armour", "Lululemon",
  "Nautica", "Guess", "Fossil", "Herschel", "JanSport", "Osprey", "Samsonite", "Tumi",

  // Watches and jewellery
  "Casio", "G-Shock", "Seiko", "Citizen", "Timex", "Bulova", "Swatch", "Omega",
  "Tissot", "Hamilton", "Orient", "Invicta", "Movado", "Rolex", "Tag Heuer", "Breitling",
  "Garmin", "Fitbit", "Pandora", "Swarovski", "Tiffany", "David Yurman", "Alex and Ani",

  // Fragrance
  "Chanel", "Tom Ford", "Creed", "Jo Malone", "Diptyque", "Byredo", "Le Labo",
  "Maison Margiela", "Paco Rabanne", "Azzaro", "Dolce & Gabbana", "Giorgio Armani",
  "Hugo Boss", "Montblanc", "Paul Sebastian", "Viktor & Rolf", "Marc Jacobs Fragrances",

  // Kitchen and small appliances
  "Ninja", "Instant Pot", "Cuisinart", "KitchenAid", "Keurig", "Breville", "Nespresso",
  "Hamilton Beach", "Crock-Pot", "Oster", "Black+Decker", "Chefman", "COSORI", "Gourmia",
  "Dash", "Presto", "Farberware", "Tramontina", "Lodge", "Le Creuset", "All-Clad",
  "Calphalon", "T-fal", "Rachael Ray", "Pioneer Woman", "Corelle", "Pyrex", "OXO",
  "Zwilling", "Henckels", "Wusthof", "Vitamix", "Blendtec", "NutriBullet", "Bodum",
  "Fellow", "Chemex", "Hario", "De'Longhi", "Bosch", "Gaggia", "Cosori", "Elite Gourmet",
  "Mikasa", "Lenox", "Noritake", "Villeroy & Boch", "Stone Lain",
  // The marketplace long tail. Not household names, but they are the name on
  // the box, and a shopper deciding whether to click wants to see it.
  "Carote", "Granitestone", "Mainstays", "Bella Pro", "Kalorik", "PowerXL",
  "Typhur", "Astercook", "Uten", "Figmint", "Bonavita", "Beautiful", "Aroma",
  "Elite Gourmet", "Nutrichef", "Sensarte", "Blue Diamond", "GreenPan", "Caraway",
  "HexClad", "Made In", "Rachael Ray", "Kitchen Elite", "GoWISE", "Emeril Lagasse",

  // Floor care
  "iRobot", "Dyson", "Shark", "Bissell", "eufy", "Roborock", "Tineco", "Hoover", "ECOVACS",

  // Gaming and PC peripherals
  "Razer", "Logitech", "Corsair", "SteelSeries", "HyperX", "Astro", "Turtle Beach",
  "Redragon", "Glorious", "Ducky", "Keychron", "Akko", "Varmilo", "Cooler Master",
  "ASUS ROG", "Alienware", "Scuf", "PowerA", "8BitDo", "Nintendo", "PlayStation",
  "Sony", "Microsoft", "Xbox", "Elgato", "Anker", "Baseus", "Ugreen",

  // Audio and consumer tech
  "Bose", "JBL", "Beats", "Sennheiser", "Audio-Technica", "Marshall", "Sonos", "Skullcandy",
  "JLab", "Apple", "Samsung", "Anker Soundcore", "Soundcore", "Jabra", "Philips", "Govee",
  "TP-Link", "Ring", "Wyze", "Nanoleaf", "Satechi", "Twelve South", "Native Union", "MOFT",

  // Cameras, optics and hobby
  "Polaroid", "Fujifilm", "Instax", "Canon", "Nikon", "Kodak", "GoPro", "Celestron",
  "Orion", "Meade", "Gskyer", "Sky-Watcher", "Bushnell",

  // Pens, stationery and art
  "Lamy", "Pilot", "Parker", "Waterman", "Cross", "TWSBI", "Faber-Castell", "Prismacolor",
  "Winsor & Newton", "Copic", "Sakura", "Strathmore", "Arteza", "Crayola", "Melissa & Doug",

  // Toys, games and models
  "LEGO", "Hot Wheels", "Matchbox", "Maisto", "Bburago", "Greenlight", "Auto World",
  "Barbie", "Funko", "Pokemon", "Hasbro", "Mattel", "Playmobil", "PlanToys", "Tegu",
  "Ravensburger", "Exploding Kittens", "Ticket to Ride", "Catan", "Traxxas", "Redcat",
  "Revell", "Tamiya", "Herpa", "Gemini Jets", "Corgi", "Panini", "Topps", "Upper Deck",

  // Music and instruments
  "Fender", "Squier", "Yamaha", "Casio", "Donner", "Kala", "Hohner", "Roland", "Korg",

  // Sports, outdoors and drinkware
  "Yeti", "Hydro Flask", "Owala", "Contigo", "Thermos", "Zojirushi", "Simple Modern",
  "Stanley", "Rumpl", "Snow Peak", "Barebones", "Coleman", "Columbia", "Wilson",
  "Spalding", "Franklin", "Element", "Chemical Guys", "Meguiar's", "Adam's Polishes",
  "Armor All", "Griot's Garage",

  // Sunglasses
  "Ray-Ban", "Oakley", "Maui Jim", "Persol", "Costa Del Mar", "Knockaround", "Goodr",
];

interface Entry {
  /** What the card shows. */
  display: string;
  /** Lowercased form searched for in the title. */
  key: string;
  leadingOnly: boolean;
}

/**
 * Longest key first, so "Air Jordan" wins over "Jordan", "Fear of God" over
 * "God" and "Anker Soundcore" over "Anker". A shorter name can only match once
 * every longer one containing it has failed.
 */
const ENTRIES: Entry[] = (() => {
  const seen = new Map<string, Entry>();

  const add = (key: string, display: string) => {
    const k = key.toLowerCase();
    if (!seen.has(k)) seen.set(k, { display, key: k, leadingOnly: LEADING_ONLY.has(display) });
  };

  for (const brand of BRANDS) add(brand, ALIASES[brand.toLowerCase()] ?? brand);
  for (const [key, display] of Object.entries(ALIASES)) add(key, display);

  return [...seen.values()].sort((a, b) => b.key.length - a.key.length);
})();

/**
 * Titles are matched on a normalised copy: punctuation becomes spaces so
 * "COACH, Teri" and "Dolce&Gabbana" behave, and the whole string is padded so
 * a boundary test is a plain substring search at either end.
 */
function normalise(title: string): string {
  return ` ${title.toLowerCase().replace(/[^a-z0-9+&'.-]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * The brand a listing title names, or null when it names none.
 *
 * Null is a real answer and the caller should render the marketplace instead of
 * inventing something. Roughly a fifth of eBay's catalogue here is genuinely
 * unbranded: white-label air fryers, plain gold chains, generic phone cases.
 */
export function brandFromTitle(title: string): string | null {
  const haystack = normalise(title);

  for (const entry of ENTRIES) {
    const needle = ` ${entry.key} `;
    if (entry.leadingOnly) {
      if (haystack.startsWith(needle)) return entry.display;
      continue;
    }
    if (haystack.includes(needle)) return entry.display;
  }

  return null;
}

/**
 * The name a card, a detail panel and the brand filter should show.
 *
 * `platform` is already the brand for the Shopify storefronts, so most rows
 * need no `brand` of their own and this just returns it. Falling back rather
 * than requiring the column to be filled everywhere is what keeps the Etsy
 * rows honest: they say "Etsy" because that is what they are.
 *
 * Note this is the *display* name only. The "View on eBay" button keeps using
 * `platform`, because that is where the link actually goes and a button that
 * says "View on Coach" when it opens eBay would be a lie.
 */
export function brandLabel(gift: { brand?: string | null; platform: string }): string {
  return gift.brand ?? gift.platform;
}
