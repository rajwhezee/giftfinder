/**
 * Imports real Etsy listings into the Gift table via the Etsy Open API v3.
 *
 * Curation happens in QUERIES below: each entry pairs a search with the
 * taxonomy it should be filed under, so we control what a result *means*
 * rather than trying to infer categories from free-text tags.
 *
 * Usage:
 *   npm run import:etsy -- --dry-run     inspect what would be imported
 *   npm run import:etsy                  write to the database
 */

// tsx does not read .env on its own, so the credentials below would be
// undefined without this. Same pattern as prisma.config.ts.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  decodeHtmlEntities,
  EtsyApiError,
  getListingsBatch,
  pickImageUrl,
  searchActiveListings,
  toMajorUnits,
  type EtsyCredentials,
  type EtsyListing,
} from "../lib/etsy";
import { INTERESTS, OCCASIONS } from "../lib/gift-options";
import { looksNonEnglish } from "../lib/language";

const KEYSTRING = process.env.ETSY_KEYSTRING;
const SHARED_SECRET = process.env.ETSY_SHARED_SECRET;
const DRY_RUN = process.argv.includes("--dry-run");

/** Etsy's documented limit is ~10 requests/second; stay well under it. */
const REQUEST_DELAY_MS = 400;
const PER_QUERY_LIMIT = 30;
/** Etsy caps /listings/batch at 100 ids per request. */
const BATCH_SIZE = 100;

interface CuratedQuery {
  keywords: string;
  interests: string[];
  occasions: string[];
  ageMin: number;
  ageMax: number;
  maxPrice?: number;
  /** Floor in USD — used for luxury-tier queries to keep out cheap lookalikes. */
  minPrice?: number;
  /** Who the products from this search are marketed for. Omit for unisex. */
  gender?: "male" | "female";
}

const QUERIES: CuratedQuery[] = [
  {
    keywords: "personalized name necklace",
    interests: ["Jewelry", "Personalized", "Fashion"],
    occasions: ["Birthday", "Anniversary", "Valentine's Day", "Mother's Day"],
    ageMin: 14,
    ageMax: 99,
    maxPrice: 120,
  },
  {
    keywords: "engraved leather bracelet men",
    interests: ["Jewelry", "Personalized"],
    occasions: ["Birthday", "Anniversary", "Father's Day", "Valentine's Day"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 100,
    gender: "male",
  },
  // --- Explicitly gendered searches so the male/female filter has depth ---
  {
    keywords: "gift for him birthday",
    interests: ["Personalized", "Fashion"],
    occasions: ["Birthday", "Christmas", "Valentine's Day"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 90,
    gender: "male",
  },
  {
    keywords: "gift for her birthday",
    interests: ["Personalized", "Jewelry", "Self-care"],
    occasions: ["Birthday", "Christmas", "Valentine's Day"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 90,
    gender: "female",
  },
  {
    keywords: "mens wallet personalized",
    interests: ["Fashion", "Personalized"],
    occasions: ["Birthday", "Father's Day", "Graduation", "Christmas"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 80,
    gender: "male",
  },
  {
    keywords: "womens silk scarf gift",
    interests: ["Fashion", "Beauty"],
    occasions: ["Birthday", "Mother's Day", "Christmas", "Thank You"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 80,
    gender: "female",
  },
  {
    keywords: "grooming kit gift men",
    interests: ["Self-care", "Beauty"],
    occasions: ["Birthday", "Father's Day", "Christmas"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 90,
    gender: "male",
  },
  {
    keywords: "spa gift box for women",
    interests: ["Self-care", "Beauty", "Health"],
    occasions: ["Birthday", "Mother's Day", "Get Well Soon", "Thank You"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 90,
    gender: "female",
  },
  {
    keywords: "soy candle gift set",
    interests: ["Home Decor", "Self-care"],
    occasions: ["Housewarming", "Christmas", "Thank You", "Get Well Soon"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "custom star map print",
    interests: ["Astronomy", "Home Decor", "Personalized", "Romance"],
    occasions: ["Anniversary", "Wedding", "Valentine's Day"],
    ageMin: 14,
    ageMax: 99,
    maxPrice: 100,
  },
  {
    keywords: "handmade ceramic mug",
    interests: ["Coffee", "Home Decor"],
    occasions: ["Birthday", "Housewarming", "Thank You"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "vinyl record wall art",
    interests: ["Music", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 99,
    maxPrice: 90,
  },
  {
    keywords: "leather journal notebook",
    interests: ["Writing", "Reading", "Personalized"],
    occasions: ["Graduation", "Birthday", "Thank You"],
    ageMin: 14,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "board game gift",
    interests: ["Games", "Family"],
    occasions: ["Birthday", "Christmas", "Family Gathering"],
    ageMin: 8,
    ageMax: 99,
    maxPrice: 90,
  },
  {
    keywords: "montessori wooden toy",
    interests: ["Games", "STEM", "Creativity"],
    occasions: ["Birthday", "Christmas"],
    ageMin: 2,
    ageMax: 10,
    maxPrice: 80,
  },
  {
    keywords: "gardening gift set",
    interests: ["Gardening", "Outdoors"],
    occasions: ["Housewarming", "Birthday", "Mother's Day"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 90,
  },
  {
    keywords: "skincare gift set natural",
    interests: ["Beauty", "Self-care", "Health"],
    occasions: ["Birthday", "Mother's Day", "Get Well Soon", "Thank You"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 90,
  },
  {
    keywords: "camping outdoor gift",
    interests: ["Outdoors", "Travel"],
    occasions: ["Birthday", "Christmas", "Father's Day"],
    ageMin: 14,
    ageMax: 80,
    maxPrice: 100,
  },
  {
    keywords: "gaming desk decor",
    interests: ["Gaming", "Home Decor", "Tech"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 45,
    maxPrice: 90,
  },
  {
    keywords: "watercolor art print",
    interests: ["Art", "Painting", "Home Decor"],
    occasions: ["Birthday", "Housewarming", "Christmas"],
    ageMin: 12,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "cooking apron personalized",
    interests: ["Cooking", "Food", "Personalized"],
    occasions: ["Wedding", "Housewarming", "Father's Day", "Mother's Day"],
    ageMin: 18,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "yoga meditation gift",
    interests: ["Fitness", "Health", "Self-care"],
    occasions: ["Birthday", "New Year", "Get Well Soon"],
    ageMin: 14,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "travel accessories gift",
    interests: ["Travel", "Personalized"],
    occasions: ["Graduation", "Birthday", "Christmas"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 90,
  },
  {
    keywords: "car enthusiast poster",
    interests: ["Cars", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 70,
    maxPrice: 80,
  },
  {
    keywords: "sports team wall art",
    interests: ["Sports", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 10,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "photography gift print",
    interests: ["Photography", "Art", "Home Decor"],
    occasions: ["Birthday", "Housewarming", "Thank You"],
    ageMin: 14,
    ageMax: 99,
    maxPrice: 90,
  },

  // --- International & cultural occasions ---
  // One curated query per occasion so it actually returns something the first
  // time someone searches for it, rather than relying on incidental overlap.
  {
    keywords: "diwali gift set",
    interests: ["Home Decor", "Family"],
    occasions: ["Diwali"],
    ageMin: 5,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "holi color gift set",
    interests: ["Family", "Outdoors"],
    occasions: ["Holi"],
    ageMin: 5,
    ageMax: 70,
    maxPrice: 60,
  },
  {
    keywords: "rakhi gift set",
    interests: ["Jewelry", "Family", "Personalized"],
    occasions: ["Raksha Bandhan"],
    ageMin: 5,
    ageMax: 99,
    maxPrice: 60,
  },
  {
    keywords: "eid mubarak gift set",
    interests: ["Family", "Home Decor", "Self-care"],
    occasions: ["Eid al-Fitr"],
    ageMin: 5,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "eid gift box",
    interests: ["Family", "Food"],
    occasions: ["Eid al-Adha"],
    ageMin: 5,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "hanukkah gift",
    interests: ["Home Decor", "Family", "Jewelry"],
    occasions: ["Hanukkah"],
    ageMin: 5,
    ageMax: 99,
    maxPrice: 90,
  },
  {
    keywords: "passover seder gift",
    interests: ["Family", "Cooking", "Home Decor"],
    occasions: ["Passover"],
    ageMin: 12,
    ageMax: 99,
    maxPrice: 90,
  },
  {
    keywords: "lunar new year red envelope gift",
    interests: ["Home Decor", "Family"],
    occasions: ["Lunar New Year"],
    ageMin: 5,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "mooncake gift box",
    interests: ["Food", "Family"],
    occasions: ["Mid-Autumn Festival"],
    ageMin: 10,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "nowruz haft seen gift",
    interests: ["Home Decor", "Family"],
    occasions: ["Nowruz"],
    ageMin: 10,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "vaisakhi gift",
    interests: ["Family", "Fashion"],
    occasions: ["Vaisakhi"],
    ageMin: 10,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "onam gift set",
    interests: ["Home Decor", "Family"],
    occasions: ["Onam"],
    ageMin: 10,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "quinceanera gift",
    interests: ["Jewelry", "Fashion", "Personalized"],
    occasions: ["Quinceañera"],
    ageMin: 13,
    ageMax: 18,
    maxPrice: 100,
  },
  {
    keywords: "day of the dead gift",
    interests: ["Art", "Home Decor"],
    occasions: ["Day of the Dead"],
    ageMin: 12,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "kwanzaa gift set",
    interests: ["Home Decor", "Family"],
    occasions: ["Kwanzaa"],
    ageMin: 10,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "st patricks day gift",
    interests: ["Fashion", "Home Decor"],
    occasions: ["St. Patrick's Day"],
    ageMin: 10,
    ageMax: 99,
    maxPrice: 60,
  },
  {
    keywords: "oktoberfest gift",
    interests: ["Food", "Fashion"],
    occasions: ["Oktoberfest"],
    ageMin: 18,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "carnival mask gift",
    interests: ["Fashion", "Art"],
    occasions: ["Carnival"],
    ageMin: 12,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "buddha zen gift",
    interests: ["Self-care", "Home Decor"],
    occasions: ["Vesak"],
    ageMin: 14,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "bar mitzvah gift",
    interests: ["Jewelry", "Personalized", "Writing"],
    occasions: ["Bar/Bat Mitzvah"],
    ageMin: 12,
    ageMax: 14,
    maxPrice: 100,
  },
  {
    keywords: "baby shower gift personalized",
    interests: ["Family", "Personalized"],
    occasions: ["Baby Shower"],
    ageMin: 18,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "retirement gift personalized",
    interests: ["Self-care", "Travel", "Personalized"],
    occasions: ["Retirement"],
    ageMin: 55,
    ageMax: 99,
    maxPrice: 100,
  },

  // --- Gaming, broken out by genre/platform so the catalog has real depth ---
  {
    keywords: "retro arcade gaming decor",
    interests: ["Gaming", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Housewarming"],
    ageMin: 12,
    ageMax: 60,
    maxPrice: 90,
  },
  {
    keywords: "gaming controller stand wood",
    interests: ["Gaming", "Tech"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 10,
    ageMax: 50,
    maxPrice: 80,
  },
  {
    keywords: "dungeons and dragons dice set",
    interests: ["Gaming", "Games", "Creativity"],
    occasions: ["Birthday", "Christmas", "Family Gathering"],
    ageMin: 12,
    ageMax: 60,
    maxPrice: 80,
  },
  {
    keywords: "pixel art video game poster",
    interests: ["Gaming", "Art", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 10,
    ageMax: 50,
    maxPrice: 70,
  },
  {
    keywords: "gaming desk setup led light",
    interests: ["Gaming", "Tech", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Housewarming"],
    ageMin: 12,
    ageMax: 45,
    maxPrice: 90,
  },
  {
    keywords: "custom gamer keycaps mechanical keyboard",
    interests: ["Gaming", "Tech", "Personalized"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 50,
    maxPrice: 90,
  },
  {
    keywords: "handmade chess set wooden",
    interests: ["Games", "Home Decor", "Creativity"],
    occasions: ["Birthday", "Christmas", "Retirement", "Family Gathering"],
    ageMin: 10,
    ageMax: 99,
    maxPrice: 150,
  },
  {
    keywords: "tabletop rpg game master gift",
    interests: ["Gaming", "Games", "Creativity"],
    occasions: ["Birthday", "Christmas"],
    ageMin: 14,
    ageMax: 60,
    maxPrice: 90,
  },
  {
    keywords: "gamer hoodie shirt",
    interests: ["Gaming", "Fashion"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 45,
    maxPrice: 70,
  },
  {
    keywords: "puzzle brain teaser wooden game",
    interests: ["Games", "STEM", "Creativity"],
    occasions: ["Birthday", "Christmas", "Family Gathering", "Get Well Soon"],
    ageMin: 6,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "gaming mouse pad desk mat large",
    interests: ["Gaming", "Tech"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 50,
    maxPrice: 70,
  },
  {
    keywords: "video game character plush",
    interests: ["Gaming", "Creativity"],
    occasions: ["Birthday", "Christmas"],
    ageMin: 5,
    ageMax: 30,
    maxPrice: 70,
  },

  // --- Luxury tier ($150+; the budget slider goes to "$500+ no limit") ---
  {
    keywords: "14k solid gold necklace",
    interests: ["Jewelry", "Fashion"],
    occasions: ["Anniversary", "Birthday", "Valentine's Day", "Wedding"],
    ageMin: 18,
    ageMax: 99,
    minPrice: 150,
    maxPrice: 2000,
  },
  {
    keywords: "diamond stud earrings",
    interests: ["Jewelry", "Fashion", "Romance"],
    occasions: ["Anniversary", "Valentine's Day", "Wedding", "Birthday"],
    ageMin: 18,
    ageMax: 99,
    minPrice: 200,
    maxPrice: 3000,
  },
  {
    keywords: "vintage automatic watch",
    interests: ["Fashion", "Tech"],
    occasions: ["Anniversary", "Graduation", "Retirement", "Father's Day"],
    ageMin: 18,
    ageMax: 99,
    minPrice: 150,
    maxPrice: 2500,
    gender: "male",
  },
  {
    keywords: "leather weekender travel bag",
    interests: ["Travel", "Fashion"],
    occasions: ["Graduation", "Birthday", "Retirement"],
    ageMin: 18,
    ageMax: 99,
    minPrice: 120,
    maxPrice: 800,
  },
  {
    keywords: "cashmere throw blanket",
    interests: ["Home Decor", "Self-care"],
    occasions: ["Housewarming", "Wedding", "Anniversary", "Retirement"],
    ageMin: 18,
    ageMax: 99,
    minPrice: 100,
    maxPrice: 800,
  },
  {
    keywords: "large statement wall art original",
    interests: ["Art", "Home Decor"],
    occasions: ["Housewarming", "Wedding", "Anniversary"],
    ageMin: 18,
    ageMax: 99,
    minPrice: 150,
    maxPrice: 2000,
  },
  {
    keywords: "gold bracelet women fine jewelry",
    interests: ["Jewelry", "Fashion"],
    occasions: ["Anniversary", "Birthday", "Mother's Day", "Valentine's Day"],
    ageMin: 18,
    ageMax: 99,
    minPrice: 150,
    maxPrice: 2000,
    gender: "female",
  },
  {
    keywords: "handmade leather jacket",
    interests: ["Fashion"],
    occasions: ["Birthday", "Christmas", "Anniversary"],
    ageMin: 18,
    ageMax: 99,
    minPrice: 200,
    maxPrice: 1500,
  },
  {
    keywords: "engagement ring moissanite",
    interests: ["Jewelry", "Romance"],
    occasions: ["Anniversary", "Valentine's Day", "Wedding"],
    ageMin: 20,
    ageMax: 99,
    minPrice: 300,
    maxPrice: 4000,
  },
  {
    keywords: "handmade acoustic guitar",
    interests: ["Music"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 99,
    minPrice: 200,
    maxPrice: 2500,
  },

  // --- General catalog growth (thin interests + broad categories) ---
  {
    keywords: "natural beauty gift box",
    interests: ["Beauty", "Self-care"],
    occasions: ["Birthday", "Mother's Day", "Thank You"],
    ageMin: 16,
    ageMax: 99,
    maxPrice: 80,
  },
  {
    keywords: "celestial moon jewelry gift",
    interests: ["Astronomy", "Jewelry"],
    occasions: ["Birthday", "Anniversary", "Christmas"],
    ageMin: 14,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "romantic gift for couple",
    interests: ["Romance", "Personalized"],
    occasions: ["Anniversary", "Valentine's Day", "Wedding"],
    ageMin: 18,
    ageMax: 99,
    maxPrice: 100,
  },
  {
    keywords: "phone accessories gift",
    interests: ["Tech", "Personalized"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 99,
    maxPrice: 60,
  },
  {
    keywords: "planner stationery gift set",
    interests: ["Writing", "Creativity"],
    occasions: ["Graduation", "Birthday", "New Year"],
    ageMin: 12,
    ageMax: 99,
    maxPrice: 70,
  },
  {
    keywords: "kitchen gadget gift set",
    interests: ["Cooking", "Food"],
    occasions: ["Housewarming", "Wedding", "Christmas"],
    ageMin: 18,
    ageMax: 99,
    maxPrice: 80,
  },
  // --- Toys for children ---
  //
  // The catalogue reached almost no one under ten: 507 of 18,792 gifts fitted a
  // five-year-old. These age floors start at 3, where the rest of the manifest
  // starts at 14, because ageMin/ageMax is a hard SQL filter on the recommend
  // route and nothing else here reaches down that far.
  //
  // Etsy is handmade, so this is wooden and personalised toys rather than
  // branded diecast. Hot Wheels and remote-control cars live in the eBay
  // manifest, which needs its own credentials.
  {
    keywords: "wooden toy car kids",
    interests: ["Cars", "Creativity"],
    occasions: ["Birthday", "Christmas", "Just Because"],
    ageMin: 3,
    ageMax: 10,
    maxPrice: 80,
  },
  {
    keywords: "handmade wooden toys toddler",
    interests: ["Creativity", "Games"],
    occasions: ["Birthday", "Christmas", "Just Because"],
    ageMin: 3,
    ageMax: 8,
    maxPrice: 90,
  },
  {
    keywords: "montessori toys for kids",
    interests: ["Creativity", "STEM"],
    occasions: ["Birthday", "Christmas"],
    ageMin: 3,
    ageMax: 10,
    maxPrice: 120,
  },
  {
    keywords: "personalized kids puzzle name",
    interests: ["Games", "Personalized"],
    occasions: ["Birthday", "Christmas", "Just Because"],
    ageMin: 3,
    ageMax: 10,
    maxPrice: 70,
  },
  {
    keywords: "kids art craft kit",
    interests: ["Art", "Creativity"],
    occasions: ["Birthday", "Christmas", "Just Because"],
    ageMin: 4,
    ageMax: 12,
    maxPrice: 70,
  },
  {
    keywords: "dinosaur toy for kids",
    interests: ["Games", "Creativity"],
    occasions: ["Birthday", "Christmas", "Just Because"],
    ageMin: 3,
    ageMax: 10,
    maxPrice: 80,
  },
];

interface StagedGift {
  listingId: number;
  name: string;
  description: string;
  /** Always in USD — converted at import time for non-USD listings. */
  price: number;
  /** Original listing currency; "USD" means price is exact, anything else approximate. */
  currency: string;
  gender: "male" | "female" | "unisex";
  /** Filled in by the second-phase batch fetch; listings without one are dropped. */
  imageUrl: string | null;
  productUrl: string;
  platform: string;
  occasions: Set<string>;
  interests: Set<string>;
  ageMin: number;
  ageMax: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * USD exchange rates, fetched once per run from the ECB-backed open.er-api.com
 * (free, no key). Rates map currency code -> units per 1 USD, so
 * priceUSD = amount / rate. Conversion is approximate — the buyer pays the
 * seller's own currency price on Etsy — which is why the original currency is
 * stored and the UI shows "~" on converted prices.
 */
async function fetchFxRates(): Promise<Record<string, number>> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`FX rate fetch failed: ${res.status}`);
  const json = (await res.json()) as { result: string; rates?: Record<string, number> };
  if (json.result !== "success" || !json.rates) {
    throw new Error(`FX rate response malformed: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.rates;
}

/** Guards against a typo in QUERIES silently creating a taxonomy value the quiz can never select. */
function assertTaxonomyValid() {
  const badInterests = new Set<string>();
  const badOccasions = new Set<string>();

  for (const q of QUERIES) {
    q.interests.filter((i) => !INTERESTS.includes(i as never)).forEach((i) => badInterests.add(i));
    q.occasions.filter((o) => !OCCASIONS.includes(o as never)).forEach((o) => badOccasions.add(o));
  }

  if (badInterests.size || badOccasions.size) {
    throw new Error(
      `QUERIES reference values missing from lib/gift-options.ts — ` +
        `interests: [${[...badInterests].join(", ")}], occasions: [${[...badOccasions].join(", ")}]`,
    );
  }
}

/**
 * Truncates by Unicode code point, not UTF-16 code unit. Etsy titles/descriptions
 * routinely contain emoji (astral-plane characters made of a surrogate pair);
 * String.slice cuts at code-unit offsets and can split a pair in half,
 * producing a lone surrogate that Postgres's driver rejects outright
 * ("unexpected end of hex escape"). Also strips NUL bytes, which `text`
 * columns reject unconditionally regardless of length.
 */
function truncateText(text: string, maxLength: number): string {
  const NUL = String.fromCharCode(0);
  const clean = text.split(NUL).join("");
  const codePoints = [...clean];
  return codePoints.length <= maxLength ? clean : codePoints.slice(0, maxLength).join("");
}

function stage(
  listing: EtsyListing,
  query: CuratedQuery,
  staged: Map<string, StagedGift>,
  fxRates: Record<string, number>,
): string | null {
  const rawPrice = toMajorUnits(listing.price);
  const title = decodeHtmlEntities(listing.title ?? "").trim();
  const url = listing.url?.trim();
  const currency = listing.price?.currency_code || "USD";

  if (!title) return "missing title";
  if (!url) return "missing url";
  if (!listing.listing_id) return "missing listing_id";
  // "download" is a digital file (SVGs, printables) — not a shippable gift.
  if (listing.listing_type === "download") return "digital download";
  // Etsy serves sellers' own listings, so a German or French title arrives
  // intact. The site is English-only, and one led /gifts/retirement.
  if (looksNonEnglish(title)) return "not English";
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
    return `bad price (${JSON.stringify(listing.price)})`;
  }

  let price = rawPrice;
  if (currency !== "USD") {
    const rate = fxRates[currency];
    if (!rate || rate <= 0) return `no FX rate for ${currency}`;
    price = Math.round((rawPrice / rate) * 100) / 100;
    // min/maxPrice in QUERIES are meant in USD; the Etsy-side min/max_price
    // filter ran against the seller's currency, so re-check after conversion.
    if (query.maxPrice !== undefined && price > query.maxPrice) {
      return "over budget after conversion";
    }
    if (query.minPrice !== undefined && price < query.minPrice) {
      return "under price floor after conversion";
    }
  }

  const existing = staged.get(url);
  if (existing) {
    // Same listing surfaced by another query — merge its taxonomy rather than
    // overwrite, and widen the age range to cover both intents. Conflicting
    // gender signals collapse to unisex.
    query.interests.forEach((i) => existing.interests.add(i));
    query.occasions.forEach((o) => existing.occasions.add(o));
    existing.ageMin = Math.min(existing.ageMin, query.ageMin);
    existing.ageMax = Math.max(existing.ageMax, query.ageMax);
    const queryGender = query.gender ?? "unisex";
    if (existing.gender !== queryGender) existing.gender = "unisex";
    return null;
  }

  const description = decodeHtmlEntities(listing.description ?? "")
    .replace(/\s+/g, " ")
    .trim();

  staged.set(url, {
    listingId: listing.listing_id,
    name: truncateText(title, 140),
    description: truncateText(description, 400) || title,
    price,
    currency,
    gender: query.gender ?? "unisex",
    imageUrl: null,
    productUrl: url,
    platform: "Etsy",
    occasions: new Set(query.occasions),
    interests: new Set(query.interests),
    ageMin: query.ageMin,
    ageMax: query.ageMax,
  });
  return null;
}

/** Second phase: /listings/active omits images, so fetch them by id in batches. */
async function attachImages(credentials: EtsyCredentials, staged: Map<string, StagedGift>) {
  const gifts = [...staged.values()];
  const byListingId = new Map(gifts.map((g) => [g.listingId, g]));
  const ids = gifts.map((g) => g.listingId);

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    try {
      const listings = await getListingsBatch(credentials, chunk);
      for (const listing of listings) {
        const gift = byListingId.get(listing.listing_id);
        if (gift) gift.imageUrl = pickImageUrl(listing);
      }
      console.log(`  images: ${Math.min(i + BATCH_SIZE, ids.length)}/${ids.length}`);
    } catch (error) {
      const detail = error instanceof EtsyApiError ? `${error.status}: ${error.body.slice(0, 150)}` : error;
      console.error(`  image batch starting at ${i} FAILED — ${detail}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

async function main() {
  if (!KEYSTRING || !SHARED_SECRET) {
    console.error(
      "Etsy credentials missing. Add both to .env (not .env.example, which is committed):\n" +
        '  ETSY_KEYSTRING="..."\n  ETSY_SHARED_SECRET="..."\n' +
        "Both are on https://www.etsy.com/developers/your-apps — v3 sends them as one header.",
    );
    process.exitCode = 1;
    return;
  }
  const credentials = { keystring: KEYSTRING, sharedSecret: SHARED_SECRET };

  assertTaxonomyValid();

  console.log("Fetching USD exchange rates...");
  const fxRates = await fetchFxRates();

  const staged = new Map<string, StagedGift>();
  const skipped: Record<string, number> = {};
  let fetched = 0;

  for (const query of QUERIES) {
    try {
      const res = await searchActiveListings(credentials, {
        keywords: query.keywords,
        limit: PER_QUERY_LIMIT,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
      });
      fetched += res.results?.length ?? 0;

      for (const listing of res.results ?? []) {
        const reason = stage(listing, query, staged, fxRates);
        if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
      }

      console.log(`  "${query.keywords}" → ${res.results?.length ?? 0} listings`);
    } catch (error) {
      if (error instanceof EtsyApiError) {
        console.error(`  "${query.keywords}" FAILED ${error.status}: ${error.body.slice(0, 200)}`);
      } else {
        console.error(`  "${query.keywords}" FAILED:`, error);
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `\nFetched ${fetched} listings across ${QUERIES.length} queries → ${staged.size} unique gifts.`,
  );

  console.log("\nFetching images...");
  await attachImages(credentials, staged);

  const withoutImage = [...staged.entries()].filter(([, g]) => !g.imageUrl);
  withoutImage.forEach(([url]) => staged.delete(url));
  if (withoutImage.length) skipped["no image"] = withoutImage.length;

  console.log(`\n${staged.size} gifts ready.`);
  if (Object.keys(skipped).length) {
    console.log("Skipped:");
    for (const [reason, count] of Object.entries(skipped)) console.log(`  ${count} × ${reason}`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Sample:");
    for (const gift of [...staged.values()].slice(0, 8)) {
      console.log(
        `  ${gift.name.slice(0, 55).padEnd(55)} $${gift.price.toFixed(2).padStart(7)} ` +
          `[${[...gift.interests].join(", ")}]\n    ${gift.imageUrl}`,
      );
    }
    return;
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  let upserted = 0;
  try {
    for (const gift of staged.values()) {
      const data = {
        name: gift.name,
        description: gift.description,
        price: gift.price,
        currency: gift.currency,
        gender: gift.gender,
        imageUrl: gift.imageUrl!,
        productUrl: gift.productUrl,
        platform: gift.platform,
        occasions: [...gift.occasions],
        interests: [...gift.interests],
        ageMin: gift.ageMin,
        ageMax: gift.ageMax,
      };
      await prisma.gift.upsert({
        where: { productUrl: gift.productUrl },
        update: data,
        create: data,
      });
      upserted++;
    }
    console.log(`\nUpserted ${upserted} gift(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
