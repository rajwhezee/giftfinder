/**
 * Imports branded products from eBay's Browse API.
 *
 * eBay fills the gap Etsy and the DTC brands can't: recognisable fashion and
 * luxury labels — Coach, Michael Kors, Kate Spade, designer fragrance, watches,
 * sneakers — across every price tier.
 *
 * Two kinds of query:
 *   - `new`      brand-new, fixed-price listings from strong sellers.
 *   - `authenticated`  eBay's Authenticity Guarantee programme, where eBay
 *     itself inspects the item before it reaches the buyer. This is the only
 *     responsible way to surface pre-owned luxury: it's how you get real Louis
 *     Vuitton and Gucci without vouching for authenticity yourself.
 *
 * Usage:
 *   npm run import:ebay -- --dry-run     inspect what would be imported
 *   npm run import:ebay                  write to the database
 */

// tsx does not read .env on its own. Same pattern as prisma.config.ts.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  cleanItemUrl,
  DELIVERY_COUNTRY,
  DELIVERY_POSTAL_CODE,
  EbayApiError,
  pickImageUrl,
  searchItems,
  type EbayItemSummary,
} from "../lib/ebay";
import { INTERESTS, JUST_BECAUSE, OCCASIONS } from "../lib/gift-options";
import { looksNonEnglish } from "../lib/language";

const CLIENT_ID = process.env.EBAY_CLIENT_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const DRY_RUN = process.argv.includes("--dry-run");
/** Let the query manifest overwrite tags that enrich-tags now owns. */
const RETAG = process.argv.includes("--retag");

const REQUEST_DELAY_MS = 400;
const PER_QUERY_LIMIT = 60;

/** Seller quality floor — eBay's long tail is exactly where the junk lives. */
const MIN_FEEDBACK_PERCENT = 97;
const MIN_FEEDBACK_SCORE = 25;

interface CuratedQuery {
  label: string;
  q: string;
  mode: "new" | "authenticated";
  minPrice: number;
  maxPrice: number;
  interests: string[];
  occasions: string[];
  ageMin: number;
  ageMax: number;
  gender?: "male" | "female";
}

const QUERIES: CuratedQuery[] = [
  // --- Household essentials and peripherals, added 2026-08-31 ---
  //
  // The catalogue held 0 air fryers and 0 cutlery sets, so the household
  // tier on the family festivals had almost nothing to rank, and Razer,
  // Logitech and Corsair have no storefront feed of their own. Best Buy
  // would have covered both and is not a realistic key to get, so eBay does
  // it: same products, a keyset that needs no approval, and the seller
  // floor above already keeps the long tail out.
  {
    label: "Air fryers",
    q: "air fryer",
    mode: "new",
    minPrice: 50,
    maxPrice: 350,
    interests: ["Cooking", "Food", "Home Decor"],
    occasions: ["Housewarming", "Christmas", "Wedding", "Birthday", "New Year", "Diwali", "Lunar New Year", "Eid al-Fitr"],
    ageMin: 22,
    ageMax: 75,
  },
  {
    label: "Flatware and cutlery sets",
    q: "flatware set stainless",
    mode: "new",
    minPrice: 40,
    maxPrice: 400,
    interests: ["Cooking", "Home Decor"],
    occasions: ["Wedding", "Housewarming", "Anniversary", "Christmas", "Diwali", "Lunar New Year", "Onam"],
    ageMin: 22,
    ageMax: 80,
  },
  {
    label: "Cookware sets",
    q: "cookware set nonstick",
    mode: "new",
    minPrice: 60,
    maxPrice: 500,
    interests: ["Cooking", "Home Decor"],
    occasions: ["Wedding", "Housewarming", "Christmas", "Anniversary", "Diwali", "Lunar New Year", "Eid al-Fitr"],
    ageMin: 22,
    ageMax: 80,
  },
  {
    label: "Stand mixers",
    q: "stand mixer",
    mode: "new",
    minPrice: 150,
    maxPrice: 600,
    interests: ["Cooking", "Food"],
    occasions: ["Wedding", "Housewarming", "Christmas", "Anniversary", "Birthday"],
    ageMin: 22,
    ageMax: 75,
  },
  {
    label: "Espresso machines",
    q: "espresso machine",
    mode: "new",
    minPrice: 100,
    maxPrice: 900,
    interests: ["Coffee", "Cooking"],
    occasions: ["Housewarming", "Christmas", "Birthday", "Anniversary", "Father's Day"],
    ageMin: 22,
    ageMax: 75,
  },
  {
    label: "Electric kettles and pour-over",
    q: "electric gooseneck kettle",
    mode: "new",
    minPrice: 40,
    maxPrice: 250,
    interests: ["Coffee", "Cooking"],
    occasions: ["Housewarming", "Christmas", "Birthday", "Thank You", "Diwali"],
    ageMin: 20,
    ageMax: 80,
  },
  {
    label: "Blenders",
    q: "blender high speed",
    mode: "new",
    minPrice: 60,
    maxPrice: 500,
    interests: ["Cooking", "Health", "Food"],
    occasions: ["Wedding", "Housewarming", "Christmas", "New Year", "Birthday"],
    ageMin: 22,
    ageMax: 75,
  },
  {
    label: "Dinnerware sets",
    q: "dinnerware set porcelain",
    mode: "new",
    minPrice: 50,
    maxPrice: 400,
    interests: ["Home Decor", "Cooking"],
    occasions: ["Wedding", "Housewarming", "Anniversary", "Diwali", "Lunar New Year", "Onam", "Christmas"],
    ageMin: 22,
    ageMax: 80,
  },
  {
    label: "Robot vacuums",
    q: "robot vacuum",
    mode: "new",
    minPrice: 120,
    maxPrice: 700,
    interests: ["Tech", "Home Decor"],
    occasions: ["Housewarming", "Christmas", "New Year", "Wedding"],
    ageMin: 25,
    ageMax: 75,
  },
  {
    label: "Razer peripherals",
    q: "razer keyboard mouse headset",
    mode: "new",
    minPrice: 40,
    maxPrice: 400,
    interests: ["Gaming", "Tech"],
    occasions: ["Birthday", "Christmas", "Graduation", "New Year", "Lunar New Year"],
    ageMin: 14,
    ageMax: 45,
  },
  {
    label: "Logitech peripherals",
    q: "logitech mx mouse keyboard",
    mode: "new",
    minPrice: 40,
    maxPrice: 350,
    interests: ["Tech", "Gaming"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day", "Lunar New Year"],
    ageMin: 16,
    ageMax: 60,
  },
  // Two brands ANDed returned nothing at all - eBay matches all the words, and
  // no listing names both. One query per brand.
  {
    label: "Corsair gaming gear",
    q: "corsair gaming headset keyboard",
    mode: "new",
    minPrice: 40,
    maxPrice: 350,
    interests: ["Gaming", "Tech"],
    occasions: ["Birthday", "Christmas", "Graduation", "Lunar New Year"],
    ageMin: 14,
    ageMax: 45,
  },
  {
    label: "SteelSeries gaming gear",
    q: "steelseries headset mouse",
    mode: "new",
    minPrice: 40,
    maxPrice: 350,
    interests: ["Gaming", "Tech"],
    occasions: ["Birthday", "Christmas", "Graduation", "Lunar New Year"],
    ageMin: 14,
    ageMax: 45,
  },
  {
    label: "Gaming controllers",
    q: "wireless controller xbox playstation",
    mode: "new",
    minPrice: 40,
    maxPrice: 200,
    interests: ["Gaming"],
    occasions: ["Birthday", "Christmas", "Graduation", "Lunar New Year"],
    ageMin: 10,
    ageMax: 45,
  },
  {
    label: "Mechanical keyboards",
    q: "mechanical keyboard hot swappable",
    mode: "new",
    minPrice: 50,
    maxPrice: 300,
    interests: ["Gaming", "Tech", "Writing"],
    occasions: ["Birthday", "Christmas", "Graduation", "Lunar New Year"],
    ageMin: 14,
    ageMax: 50,
  },
  // --- Handbags & leather goods ---
  {
    label: "Coach handbags",
    q: "coach handbag",
    mode: "new",
    minPrice: 60,
    maxPrice: 500,
    interests: ["Fashion", "Travel"],
    occasions: ["Birthday", "Anniversary", "Christmas", "Mother's Day", "Valentine's Day"],
    ageMin: 18,
    ageMax: 75,
    gender: "female",
  },
  {
    label: "Michael Kors bags",
    q: "michael kors handbag",
    mode: "new",
    minPrice: 60,
    maxPrice: 450,
    interests: ["Fashion"],
    occasions: ["Birthday", "Christmas", "Mother's Day", "Anniversary"],
    ageMin: 18,
    ageMax: 75,
    gender: "female",
  },
  {
    label: "Kate Spade",
    q: "kate spade handbag",
    mode: "new",
    minPrice: 60,
    maxPrice: 450,
    interests: ["Fashion"],
    occasions: ["Birthday", "Christmas", "Graduation", "Mother's Day"],
    ageMin: 18,
    ageMax: 70,
    gender: "female",
  },
  {
    label: "Louis Vuitton (authenticated)",
    q: "louis vuitton handbag",
    mode: "authenticated",
    minPrice: 400,
    maxPrice: 4000,
    interests: ["Fashion", "Travel"],
    occasions: ["Anniversary", "Birthday", "Wedding", "Retirement"],
    ageMin: 21,
    ageMax: 80,
    gender: "female",
  },
  {
    label: "Gucci (authenticated)",
    q: "gucci bag",
    mode: "authenticated",
    minPrice: 400,
    maxPrice: 4000,
    interests: ["Fashion"],
    occasions: ["Anniversary", "Birthday", "Wedding"],
    ageMin: 21,
    ageMax: 80,
  },
  {
    label: "Men's leather wallets",
    q: "coach mens wallet",
    mode: "new",
    minPrice: 40,
    maxPrice: 300,
    interests: ["Fashion", "Personalized"],
    occasions: ["Father's Day", "Birthday", "Graduation", "Christmas"],
    ageMin: 18,
    ageMax: 80,
    gender: "male",
  },

  // --- Fragrance ---
  {
    label: "Designer perfume (women)",
    q: "designer perfume women eau de parfum",
    mode: "new",
    minPrice: 35,
    maxPrice: 300,
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Valentine's Day", "Christmas", "Mother's Day", "Anniversary"],
    ageMin: 16,
    ageMax: 80,
    gender: "female",
  },
  {
    label: "Designer cologne (men)",
    q: "designer cologne men eau de toilette",
    mode: "new",
    minPrice: 35,
    maxPrice: 300,
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Father's Day", "Christmas", "Valentine's Day"],
    ageMin: 16,
    ageMax: 80,
    gender: "male",
  },

  // --- Watches & jewellery ---
  {
    label: "Watches",
    q: "seiko citizen watch",
    mode: "new",
    minPrice: 80,
    maxPrice: 900,
    interests: ["Fashion", "Tech"],
    occasions: ["Graduation", "Anniversary", "Retirement", "Father's Day", "Birthday"],
    ageMin: 18,
    ageMax: 90,
  },
  {
    label: "Luxury watches (authenticated)",
    q: "luxury watch",
    mode: "authenticated",
    minPrice: 600,
    maxPrice: 6000,
    interests: ["Fashion"],
    occasions: ["Retirement", "Anniversary", "Graduation"],
    ageMin: 25,
    ageMax: 90,
  },
  {
    label: "Fine jewellery",
    q: "14k gold necklace",
    mode: "new",
    minPrice: 100,
    maxPrice: 1500,
    interests: ["Jewelry", "Fashion", "Romance"],
    occasions: ["Anniversary", "Valentine's Day", "Wedding", "Birthday"],
    ageMin: 18,
    ageMax: 90,
    gender: "female",
  },

  // --- Sneakers & streetwear ---
  //
  // eBay's Authenticity Guarantee covers sneakers, and that is what makes this
  // the only responsible route to the resale market: eBay inspects the pair
  // before it reaches the buyer. It is also the only route left — StockX
  // disallows /api/ and */search* in robots.txt for every user agent, and GOAT
  // returns a Cloudflare challenge even for robots.txt itself.
  //
  // The boutiques in import-shopify.ts cover these silhouettes at retail. These
  // queries exist for the pairs that never sit on a shelf at retail: the
  // collabs, and anything already sold out.
  {
    label: "Sneakers (authenticated)",
    q: "nike jordan sneakers",
    mode: "authenticated",
    minPrice: 120,
    maxPrice: 1200,
    interests: ["Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 50,
  },
  {
    label: "Air Jordan 1 (authenticated)",
    q: "air jordan 1 retro",
    mode: "authenticated",
    minPrice: 120,
    maxPrice: 900,
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
  },
  {
    label: "Nike Dunk (authenticated)",
    q: "nike dunk low",
    mode: "authenticated",
    minPrice: 100,
    maxPrice: 700,
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
  },
  {
    label: "Travis Scott collabs (authenticated)",
    q: "travis scott jordan",
    mode: "authenticated",
    minPrice: 300,
    maxPrice: 2500,
    interests: ["Sneakers", "Fashion", "Music"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 16,
    ageMax: 40,
  },
  {
    label: "Yeezy (authenticated)",
    q: "adidas yeezy boost",
    mode: "authenticated",
    minPrice: 150,
    maxPrice: 1200,
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 16,
    ageMax: 45,
  },
  {
    label: "New Balance retro runners",
    q: "new balance 550 990 sneakers",
    mode: "new",
    minPrice: 80,
    maxPrice: 300,
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day"],
    ageMin: 14,
    ageMax: 60,
  },

  // --- Aviation ---
  //
  // 88 rows in the whole catalogue mentioned anything that flies, which is too
  // thin to carry a quiz option of its own — so these map onto existing
  // interests rather than earning a "Planes" chip. Revisit that once the
  // category has real depth; a chip with nothing behind it just returns
  // "nothing quite fits yet".
  {
    label: "Model aircraft & diecast",
    q: "diecast model airplane collectible",
    mode: "new",
    minPrice: 25,
    maxPrice: 400,
    interests: ["Creativity", "Art", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Graduation"],
    ageMin: 8,
    ageMax: 80,
  },
  {
    label: "Aviator watches",
    q: "pilot aviator watch",
    mode: "new",
    minPrice: 80,
    maxPrice: 600,
    interests: ["Fashion", "Travel"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Graduation", "Retirement"],
    ageMin: 18,
    ageMax: 80,
  },
  {
    label: "Flight simulator gear",
    q: "flight simulator yoke joystick",
    mode: "new",
    minPrice: 60,
    maxPrice: 500,
    interests: ["Gaming", "Tech", "STEM"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 70,
  },
  {
    label: "Aviation decor & blueprints",
    q: "aviation blueprint wall art propeller decor",
    mode: "new",
    minPrice: 20,
    maxPrice: 350,
    interests: ["Home Decor", "Art", "Travel"],
    occasions: ["Housewarming", "Birthday", "Christmas", "Father's Day"],
    ageMin: 16,
    ageMax: 85,
  },
  {
    label: "Sunglasses",
    q: "ray ban sunglasses",
    mode: "new",
    minPrice: 60,
    maxPrice: 400,
    interests: ["Fashion", "Travel", "Outdoors"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day"],
    ageMin: 16,
    ageMax: 80,
  },

  // --- Gifting staples ---
  {
    label: "Fountain & luxury pens",
    q: "fountain pen gift set",
    mode: "new",
    minPrice: 40,
    maxPrice: 500,
    interests: ["Writing", "Personalized"],
    occasions: ["Graduation", "Retirement", "Father's Day", "Thank You"],
    ageMin: 18,
    ageMax: 90,
  },
  {
    label: "Vinyl records",
    q: "vinyl record lp album",
    mode: "new",
    minPrice: 20,
    maxPrice: 200,
    interests: ["Music", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Anniversary"],
    ageMin: 14,
    ageMax: 90,
  },

  /* ------------------------------------------------------------------ *
   * Wishlist brands and long-tail categories.
   *
   * These are the names people actually ask for that have no other route in:
   * LEGO, UGG, Ralph Lauren, Lacoste and Longchamp run no open storefront and
   * no public API, so eBay's new-with-tags inventory is the only way to carry
   * them without an affiliate network approval.
   *
   * The remaining entries target the thinnest interests in the catalogue —
   * Cars sat at 43 gifts, Sports 54, Painting 56, Photography 79, Astronomy 127
   * — categories no DTC brand covers well but eBay's breadth does.
   * ------------------------------------------------------------------ */

  // --- Wishlist brands with no direct route ---
  {
    label: "LEGO sets",
    q: "lego set",
    mode: "new",
    minPrice: 25,
    maxPrice: 600,
    interests: ["Games", "STEM", "Creativity", "Family"],
    occasions: ["Birthday", "Christmas", "Family Gathering"],
    ageMin: 5,
    ageMax: 60,
  },
  {
    label: "UGG boots & slippers",
    q: "ugg boots",
    mode: "new",
    minPrice: 60,
    maxPrice: 300,
    interests: ["Fashion", "Self-care"],
    occasions: ["Christmas", "Birthday", "Mother's Day", "New Year"],
    ageMin: 14,
    ageMax: 80,
  },
  {
    label: "Ralph Lauren",
    q: "ralph lauren polo shirt",
    mode: "new",
    minPrice: 40,
    maxPrice: 300,
    interests: ["Fashion"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Graduation"],
    ageMin: 16,
    ageMax: 85,
  },
  {
    label: "Lacoste",
    q: "lacoste polo",
    mode: "new",
    minPrice: 40,
    maxPrice: 250,
    interests: ["Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Graduation"],
    ageMin: 16,
    ageMax: 80,
  },
  {
    label: "Longchamp",
    q: "longchamp le pliage bag",
    mode: "new",
    minPrice: 70,
    maxPrice: 400,
    interests: ["Fashion", "Travel"],
    occasions: ["Birthday", "Graduation", "Christmas", "Mother's Day"],
    ageMin: 18,
    ageMax: 75,
    gender: "female",
  },
  {
    label: "Birkenstock",
    q: "birkenstock sandals",
    mode: "new",
    minPrice: 50,
    maxPrice: 220,
    interests: ["Fashion", "Outdoors"],
    occasions: ["Birthday", "Graduation", "Christmas"],
    ageMin: 14,
    ageMax: 80,
  },

  // --- Cars (thinnest interest in the catalogue, 43 gifts) ---
  {
    label: "Die-cast model cars",
    q: "diecast model car 1:18 collectible",
    mode: "new",
    minPrice: 25,
    maxPrice: 400,
    interests: ["Cars", "Games", "Creativity"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Graduation"],
    ageMin: 8,
    ageMax: 80,
  },
  {
    label: "Car care & detailing kits",
    q: "car detailing kit gift set",
    mode: "new",
    minPrice: 30,
    maxPrice: 250,
    interests: ["Cars", "Self-care"],
    occasions: ["Father's Day", "Birthday", "Christmas"],
    ageMin: 18,
    ageMax: 80,
    gender: "male",
  },

  // --- Sports (54 gifts) ---
  {
    label: "Sports trading cards",
    q: "sports trading card sealed box",
    mode: "new",
    minPrice: 25,
    maxPrice: 400,
    interests: ["Sports", "Games"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 10,
    ageMax: 70,
  },
  {
    label: "Team merchandise",
    q: "official team jersey merchandise",
    mode: "new",
    minPrice: 30,
    maxPrice: 250,
    interests: ["Sports", "Fashion"],
    occasions: ["Birthday", "Christmas", "Father's Day"],
    ageMin: 8,
    ageMax: 80,
  },

  // --- Astronomy (127 gifts, single source) ---
  {
    label: "Telescopes & stargazing",
    q: "telescope astronomy beginner",
    mode: "new",
    minPrice: 60,
    maxPrice: 700,
    interests: ["Astronomy", "STEM", "Outdoors"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 10,
    ageMax: 80,
  },

  // --- Photography (79 gifts) ---
  {
    label: "Instant cameras & film",
    q: "instant camera polaroid film",
    mode: "new",
    minPrice: 40,
    maxPrice: 300,
    interests: ["Photography", "Creativity", "Travel"],
    occasions: ["Birthday", "Graduation", "Christmas"],
    ageMin: 10,
    ageMax: 65,
  },

  // --- Painting & art supplies (56 gifts) ---
  {
    label: "Art & painting sets",
    q: "artist paint set easel gift",
    mode: "new",
    minPrice: 25,
    maxPrice: 250,
    interests: ["Painting", "Art", "Creativity"],
    occasions: ["Birthday", "Christmas", "Graduation", "Get Well Soon"],
    ageMin: 8,
    ageMax: 85,
  },

  // --- Music instruments (163 gifts, vinyl already covered above) ---
  {
    label: "Beginner instruments",
    q: "ukulele acoustic guitar beginner",
    mode: "new",
    minPrice: 40,
    maxPrice: 400,
    interests: ["Music", "Creativity"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 8,
    ageMax: 75,
  },
  // --- Toys for children ---
  //
  // Added because the catalogue barely served anyone under about ten: 507 of
  // 18,792 gifts fitted a five-year-old, and "hot wheels" matched no title at
  // all. The existing "Cars" tag was collector diecast aged 8 and up, mostly
  // 1:18 Batmobiles, so a parent picking Cars for a small child got model cars
  // built for adults.
  //
  // The age floors are the real point of this block. Everything here starts at
  // 3 to 5 rather than the 8 to 18 the rest of the manifest uses, because
  // ageMin/ageMax is a hard SQL filter on the recommend route and nothing else
  // in the catalogue reaches down this far.
  //
  // There is no "Toys" interest, and these must be values that already exist in
  // lib/gift-options.ts or assertTaxonomyValid throws, so each query is filed
  // under what the toy is about: Cars for vehicles, Creativity for building and
  // making, Games for play, STEM for the science kits.
  {
    label: "Hot Wheels cars",
    q: "hot wheels cars",
    mode: "new",
    minPrice: 5,
    maxPrice: 60,
    interests: ["Cars", "Games"],
    occasions: ["Birthday", "Christmas", JUST_BECAUSE],
    ageMin: 3,
    ageMax: 12,
  },
  {
    label: "Hot Wheels track sets",
    q: "hot wheels track set",
    mode: "new",
    minPrice: 15,
    maxPrice: 120,
    interests: ["Cars", "Games"],
    occasions: ["Birthday", "Christmas"],
    ageMin: 4,
    ageMax: 12,
  },
  {
    label: "Matchbox and diecast toy cars",
    q: "matchbox diecast toy cars kids",
    mode: "new",
    minPrice: 5,
    maxPrice: 60,
    interests: ["Cars", "Games"],
    occasions: ["Birthday", "Christmas", JUST_BECAUSE],
    ageMin: 3,
    ageMax: 12,
  },
  {
    label: "Remote control cars for kids",
    q: "remote control car kids",
    mode: "new",
    minPrice: 15,
    maxPrice: 150,
    interests: ["Cars", "Games"],
    occasions: ["Birthday", "Christmas"],
    ageMin: 5,
    ageMax: 14,
  },
  {
    label: "Lego sets for children",
    q: "lego set kids",
    mode: "new",
    minPrice: 15,
    maxPrice: 200,
    interests: ["Creativity", "Games"],
    occasions: ["Birthday", "Christmas", JUST_BECAUSE],
    ageMin: 4,
    ageMax: 14,
  },
  {
    label: "Wooden toys",
    q: "wooden toys toddler melissa doug",
    mode: "new",
    minPrice: 10,
    maxPrice: 100,
    interests: ["Creativity", "Games"],
    occasions: ["Birthday", "Christmas", JUST_BECAUSE],
    ageMin: 3,
    ageMax: 8,
  },
  {
    label: "Children's board games and puzzles",
    q: "kids board game puzzle age 5",
    mode: "new",
    minPrice: 8,
    maxPrice: 60,
    interests: ["Games", "Family"],
    occasions: ["Birthday", "Christmas", "Family Gathering"],
    ageMin: 4,
    ageMax: 12,
  },
  {
    label: "STEM kits for children",
    q: "stem science kit kids",
    mode: "new",
    minPrice: 12,
    maxPrice: 120,
    interests: ["STEM", "Creativity"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 5,
    ageMax: 14,
  },
  {
    label: "Art sets for children",
    q: "kids art set crayons painting",
    mode: "new",
    minPrice: 8,
    maxPrice: 80,
    interests: ["Art", "Creativity"],
    occasions: ["Birthday", "Christmas", JUST_BECAUSE],
    ageMin: 3,
    ageMax: 12,
  },
];

interface StagedGift {
  name: string;
  description: string;
  price: number;
  currency: string;
  gender: "male" | "female" | "unisex";
  imageUrl: string;
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

function truncateText(text: string, maxLength: number): string {
  const NUL = String.fromCharCode(0);
  const clean = text.split(NUL).join("");
  const codePoints = [...clean];
  return codePoints.length <= maxLength ? clean : codePoints.slice(0, maxLength).join("");
}

/** Listings that are lots, empties, replicas or parts aren't giftable products. */
const EXCLUDED =
  /\b(lot of|empty bottle|replica|inspired by|for parts|repair|damaged|as-?is|read description|box only|dust bag only|authentic card|receipt only)\b/i;

function buildFilter(query: CuratedQuery): string {
  const parts = [
    "buyingOptions:{FIXED_PRICE}",
    `price:[${query.minPrice}..${query.maxPrice}]`,
    "priceCurrency:USD",
  ];

  if (query.mode === "authenticated") {
    parts.push("qualifiedPrograms:{AUTHENTICITY_GUARANTEE}");
    // eBay rejects the AUTHENTICITY_GUARANTEE filter without a destination.
    parts.push(`deliveryCountry:${DELIVERY_COUNTRY}`);
    parts.push(`deliveryPostalCode:${DELIVERY_POSTAL_CODE}`);
  } else {
    parts.push("conditions:{NEW}");
  }

  return parts.join(",");
}

function stage(
  item: EbayItemSummary,
  query: CuratedQuery,
  staged: Map<string, StagedGift>,
): string | null {
  const title = (item.title ?? "").trim();
  const imageUrl = pickImageUrl(item);
  const price = Number.parseFloat(item.price?.value ?? "");

  if (!title) return "missing title";
  if (!item.itemWebUrl) return "missing url";
  if (EXCLUDED.test(title)) return "excluded listing type";
  if (looksNonEnglish(title)) return "not English";
  if (!imageUrl) return "no image";
  if (!Number.isFinite(price) || price <= 0) return "bad price";
  if (item.price?.currency && item.price.currency !== "USD") {
    return `non-USD (${item.price.currency})`;
  }

  // Seller quality — Browse returns feedback as a string percentage.
  const feedbackPercent = Number.parseFloat(item.seller?.feedbackPercentage ?? "0");
  const feedbackScore = item.seller?.feedbackScore ?? 0;
  if (feedbackPercent < MIN_FEEDBACK_PERCENT) return `seller under ${MIN_FEEDBACK_PERCENT}%`;
  if (feedbackScore < MIN_FEEDBACK_SCORE) return `seller under ${MIN_FEEDBACK_SCORE} feedback`;

  const url = cleanItemUrl(item);
  const existing = staged.get(url);
  if (existing) {
    query.interests.forEach((i) => existing.interests.add(i));
    query.occasions.forEach((o) => existing.occasions.add(o));
    existing.ageMin = Math.min(existing.ageMin, query.ageMin);
    existing.ageMax = Math.max(existing.ageMax, query.ageMax);
    const queryGender = query.gender ?? "unisex";
    if (existing.gender !== queryGender) existing.gender = "unisex";
    return null;
  }

  // Browse search returns no description; the condition is the useful signal.
  const description =
    query.mode === "authenticated"
      ? `${item.condition ?? "Pre-owned"} · Verified through eBay Authenticity Guarantee.`
      : `${item.condition ?? "New"} · Sold on eBay.`;

  staged.set(url, {
    name: truncateText(title, 140),
    description,
    price,
    currency: "USD",
    gender: query.gender ?? "unisex",
    imageUrl,
    productUrl: url,
    platform: "eBay",
    occasions: new Set(query.occasions),
    interests: new Set(query.interests),
    ageMin: query.ageMin,
    ageMax: query.ageMax,
  });
  return null;
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "eBay credentials missing. Add both to .env (not .env.example, which is committed):\n" +
        '  EBAY_CLIENT_ID="..."      (App ID / Client ID)\n' +
        '  EBAY_CLIENT_SECRET="..."  (Cert ID / Client Secret)',
    );
    process.exitCode = 1;
    return;
  }
  const credentials = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };

  assertTaxonomyValid();

  const staged = new Map<string, StagedGift>();
  const skipped: Record<string, number> = {};
  let fetched = 0;

  for (const query of QUERIES) {
    try {
      const res = await searchItems(credentials, {
        q: query.q,
        limit: PER_QUERY_LIMIT,
        filter: buildFilter(query),
      });
      const items = res.itemSummaries ?? [];
      fetched += items.length;

      let kept = 0;
      for (const item of items) {
        const before = staged.size;
        const reason = stage(item, query, staged);
        if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
        else if (staged.size > before) kept++;
      }

      console.log(`  ${query.label.padEnd(32)} ${String(kept).padStart(3)} kept of ${items.length}`);
    } catch (error) {
      if (error instanceof EbayApiError) {
        console.error(`  ${query.label} FAILED ${error.status}: ${error.body.slice(0, 200)}`);
      } else {
        console.error(`  ${query.label} FAILED:`, error);
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nFetched ${fetched} listings across ${QUERIES.length} queries → ${staged.size} gifts.`);
  if (Object.keys(skipped).length) {
    console.log("Skipped:");
    for (const [reason, count] of Object.entries(skipped)) console.log(`  ${count} × ${reason}`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Sample:");
    for (const gift of [...staged.values()].slice(0, 12)) {
      console.log(`  $${gift.price.toFixed(2).padStart(9)}  ${gift.name.slice(0, 62)}`);
    }
    return;
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  let upserted = 0;
  try {
    for (const gift of staged.values()) {
      // What the listing says about itself, refreshed on every run.
      const listing = {
        name: gift.name,
        description: gift.description,
        price: gift.price,
        currency: gift.currency,
        imageUrl: gift.imageUrl,
        productUrl: gift.productUrl,
        platform: gift.platform,
        occasions: [...gift.occasions],
      };

      // What the query guessed about the recipient: create-only, because
      // enrich-tags owns it from then on. The third importer found carrying
      // these in `update` - shopify until 2026-08-19, etsy until 2026-08-21,
      // this one until 2026-08-22, 1,653 rows. See the note in AGENTS.md;
      // check this in any new importer before running it once, because
      // afterwards the damage is silent.
      const taxonomy = {
        gender: gift.gender,
        interests: [...gift.interests],
        ageMin: gift.ageMin,
        ageMax: gift.ageMax,
      };

      await prisma.gift.upsert({
        where: { productUrl: gift.productUrl },
        update: RETAG ? { ...listing, ...taxonomy } : listing,
        create: { ...listing, ...taxonomy },
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
