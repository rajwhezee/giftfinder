/**
 * Imports products from hand-picked DTC brands that run on Shopify.
 *
 * Curation is the BRANDS list below — a deliberately small, chosen set of
 * gift-worthy labels rather than an indiscriminate crawl. Each brand's public
 * `/products.json` is read once per page, rate-limited, with a descriptive
 * User-Agent, and every product links straight back to the merchant's own page.
 *
 * Every domain here was verified to serve the endpoint before being added.
 *
 * Usage:
 *   npm run import:shopify -- --dry-run     inspect what would be imported
 *   npm run import:shopify                  write to the database
 */

// tsx does not read .env on its own. Same pattern as prisma.config.ts.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  fetchProductsPage,
  htmlToText,
  pickImageUrl,
  pickVariant,
  productUrl,
  ShopifyFeedError,
  type ShopifyProduct,
} from "../lib/shopify";
import { INTERESTS, OCCASIONS } from "../lib/gift-options";
import { assertRulesValid, deriveTags } from "../lib/product-tags";

const DRY_RUN = process.argv.includes("--dry-run");
/**
 * Push brand-level interests, age range and gender back over existing rows.
 *
 * Destructive: it discards whatever `enrich:tags` decided per product. Only
 * reach for it when a brand's own entry in BRANDS was wrong and you intend to
 * re-run the tagging pass afterwards.
 */
const RETAG = process.argv.includes("--retag");

/** Polite pacing — these are small merchants' storefronts, not an API tier. */
const REQUEST_DELAY_MS = 900;
/** Pages per brand; 250 products/page, so 2 pages is plenty for a curated feed. */
const MAX_PAGES = 2;
/** Cap per brand so one large catalogue can't dominate the results grid. */
const MAX_PER_BRAND = 60;

const MIN_PRICE = 8;
const MAX_PRICE = 600;

interface Brand {
  /** Storefront domain, no protocol. */
  domain: string;
  /** Shown on the card as the platform, e.g. "View on Otherland". */
  name: string;
  interests: string[];
  occasions: string[];
  ageMin: number;
  ageMax: number;
  gender?: "male" | "female";
  /**
   * Fills this brand's MAX_PER_BRAND slots with matching products first.
   *
   * Without it the cap simply takes the feed in order, which for a sneaker
   * boutique means whatever dropped this week — and those feeds are roughly
   * three-quarters apparel, so the shoes the shopper came for lose their slots
   * to t-shirts. Tested against `product_type` and title together.
   */
  prefer?: RegExp;
}

/**
 * Sneaker boutiques list footwear under a dozen different `product_type`
 * spellings ("Footwear", "Sneakers", "Lifestyle Shoes", "Men's Footwear"), so
 * this reads both the type and the title. Model names are spelled out in full
 * ("air jordan", not "jordan") because the bare brand word appears on tees and
 * hats throughout the same feeds.
 */
const FOOTWEAR = /footwear|sneakers?|\bshoes?\b|\bboots?\b|\btrainers\b|\bcleats\b|\bdunk\b|air jordan|air max|air force|\byeezy\b|\bsamba\b|\bgazelle\b|new balance/i;

const BRANDS: Brand[] = [
  // --- Fragrance ---
  {
    domain: "snif.co",
    name: "Snif",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Valentine's Day", "Christmas", "Anniversary"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "dedcool.com",
    name: "DedCool",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Valentine's Day", "Christmas"],
    ageMin: 16,
    ageMax: 60,
  },
  {
    domain: "boysmells.com",
    name: "Boy Smells",
    interests: ["Home Decor", "Self-care", "Beauty"],
    occasions: ["Birthday", "Housewarming", "Christmas", "Thank You"],
    ageMin: 18,
    ageMax: 70,
  },

  // --- Candles & home fragrance ---
  {
    domain: "otherland.com",
    name: "Otherland",
    interests: ["Home Decor", "Self-care"],
    occasions: ["Housewarming", "Christmas", "Thank You", "Get Well Soon"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    domain: "homesick.com",
    name: "Homesick",
    interests: ["Home Decor", "Self-care", "Personalized"],
    occasions: ["Housewarming", "Christmas", "Thank You", "Mother's Day"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    domain: "brooklyncandlestudio.com",
    name: "Brooklyn Candle Studio",
    interests: ["Home Decor", "Self-care"],
    occasions: ["Housewarming", "Christmas", "Thank You", "Anniversary"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    domain: "pfcandleco.com",
    name: "P.F. Candle Co",
    interests: ["Home Decor", "Self-care"],
    occasions: ["Housewarming", "Christmas", "Birthday", "Thank You"],
    ageMin: 18,
    ageMax: 99,
  },

  // --- Bags, travel & accessories ---
  {
    domain: "beistravel.com",
    name: "Béis",
    interests: ["Travel", "Fashion"],
    occasions: ["Birthday", "Graduation", "Christmas", "Retirement"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "dagnedover.com",
    name: "Dagne Dover",
    interests: ["Fashion", "Travel"],
    occasions: ["Birthday", "Graduation", "Christmas", "Mother's Day"],
    ageMin: 18,
    ageMax: 70,
  },
  {
    domain: "cuyana.com",
    name: "Cuyana",
    interests: ["Fashion", "Travel", "Personalized"],
    occasions: ["Birthday", "Anniversary", "Mother's Day", "Christmas"],
    ageMin: 20,
    ageMax: 75,
    gender: "female",
  },

  // --- Beauty & skincare ---
  {
    domain: "starface.world",
    name: "Starface",
    interests: ["Beauty", "Self-care", "Creativity"],
    occasions: ["Birthday", "Christmas", "Thank You"],
    ageMin: 12,
    ageMax: 30,
  },
  {
    domain: "fentybeauty.com",
    name: "Fenty Beauty",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Christmas", "Valentine's Day", "Graduation"],
    ageMin: 14,
    ageMax: 70,
  },
  {
    domain: "meritbeauty.com",
    name: "Merit",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Christmas", "Mother's Day", "Thank You"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "beautyofjoseon.com",
    name: "Beauty of Joseon",
    interests: ["Beauty", "Self-care", "Health"],
    occasions: ["Birthday", "Christmas", "Thank You", "Get Well Soon"],
    ageMin: 14,
    ageMax: 70,
  },
  {
    domain: "glossier.com",
    name: "Glossier",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Christmas", "Valentine's Day", "Graduation"],
    ageMin: 14,
    ageMax: 60,
  },
  {
    domain: "iliabeauty.com",
    name: "ILIA",
    interests: ["Beauty", "Self-care", "Fashion", "Health"],
    occasions: ["Birthday", "Christmas", "Mother's Day", "Anniversary"],
    ageMin: 18,
    ageMax: 75,
  },
  {
    domain: "kosas.com",
    name: "Kosas",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Christmas", "Valentine's Day", "Thank You"],
    ageMin: 16,
    ageMax: 65,
  },
  {
    domain: "saiehello.com",
    name: "Saie",
    interests: ["Beauty", "Self-care", "Health"],
    occasions: ["Birthday", "Christmas", "Mother's Day", "Thank You"],
    ageMin: 16,
    ageMax: 65,
  },
  {
    domain: "tower28beauty.com",
    name: "Tower 28",
    interests: ["Beauty", "Self-care", "Health"],
    occasions: ["Birthday", "Christmas", "Get Well Soon", "Thank You"],
    ageMin: 12,
    ageMax: 60,
  },

  // --- Food & chocolate ---
  {
    domain: "compartes.com",
    name: "Compartés",
    interests: ["Food", "Cooking"],
    occasions: ["Valentine's Day", "Anniversary", "Thank You", "Christmas", "Diwali"],
    ageMin: 12,
    ageMax: 99,
  },
  {
    domain: "hukitchen.com",
    name: "Hu",
    interests: ["Food", "Health"],
    occasions: ["Thank You", "Christmas", "Get Well Soon", "Birthday"],
    ageMin: 12,
    ageMax: 99,
  },

  // --- Kitchen ---
  {
    domain: "greatjonesgoods.com",
    name: "Great Jones",
    interests: ["Cooking", "Home Decor", "Food"],
    occasions: ["Wedding", "Housewarming", "Christmas", "Anniversary"],
    ageMin: 21,
    ageMax: 99,
  },

  // --- Games ---
  {
    domain: "explodingkittens.com",
    name: "Exploding Kittens",
    interests: ["Games", "Family", "Creativity"],
    occasions: ["Birthday", "Christmas", "Family Gathering"],
    ageMin: 7,
    ageMax: 60,
  },

  // --- Fragrance (verified 2026-08-12) ---
  {
    domain: "ellisbrooklyn.com",
    name: "Ellis Brooklyn",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Valentine's Day", "Christmas", "Anniversary"],
    ageMin: 16,
    ageMax: 75,
  },
  {
    domain: "byrosiejane.com",
    name: "By Rosie Jane",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Valentine's Day", "Christmas", "Mother's Day"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "hereticparfum.com",
    name: "Heretic",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Anniversary", "Valentine's Day", "Christmas"],
    ageMin: 18,
    ageMax: 75,
  },
  {
    domain: "kierin-nyc.com",
    name: "Kierin NYC",
    interests: ["Beauty", "Self-care", "Fashion"],
    occasions: ["Birthday", "Valentine's Day", "Christmas"],
    ageMin: 16,
    ageMax: 65,
  },

  // --- Jewellery ---
  {
    domain: "gorjana.com",
    name: "Gorjana",
    interests: ["Jewelry", "Fashion"],
    occasions: ["Birthday", "Anniversary", "Valentine's Day", "Mother's Day", "Christmas"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "astridandmiyu.com",
    name: "Astrid & Miyu",
    interests: ["Jewelry", "Fashion"],
    occasions: ["Birthday", "Anniversary", "Valentine's Day", "Graduation"],
    ageMin: 16,
    ageMax: 65,
  },
  {
    domain: "baublebar.com",
    name: "BaubleBar",
    interests: ["Jewelry", "Fashion", "Personalized"],
    occasions: ["Birthday", "Christmas", "Valentine's Day", "Mother's Day"],
    ageMin: 14,
    ageMax: 65,
  },

  // --- Luggage & travel ---
  {
    domain: "awaytravel.com",
    name: "Away",
    interests: ["Travel", "Fashion"],
    occasions: ["Graduation", "Birthday", "Christmas", "Retirement", "Wedding"],
    ageMin: 18,
    ageMax: 75,
  },
  {
    domain: "calpaktravel.com",
    name: "CALPAK",
    interests: ["Travel", "Fashion"],
    occasions: ["Graduation", "Birthday", "Christmas", "Retirement"],
    ageMin: 16,
    ageMax: 70,
  },

  // --- Coffee, tea & pantry ---
  {
    domain: "fellowproducts.com",
    name: "Fellow",
    interests: ["Coffee", "Home Decor", "Cooking"],
    occasions: ["Housewarming", "Christmas", "Wedding", "Father's Day", "Birthday"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    domain: "drinktrade.com",
    name: "Trade Coffee",
    interests: ["Coffee", "Food"],
    occasions: ["Christmas", "Thank You", "Birthday", "Father's Day"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    domain: "bellocq.com",
    name: "Bellocq",
    interests: ["Food", "Self-care", "Home Decor"],
    occasions: ["Thank You", "Christmas", "Get Well Soon", "Housewarming"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    domain: "graza.co",
    name: "Graza",
    interests: ["Cooking", "Food"],
    occasions: ["Housewarming", "Wedding", "Thank You", "Christmas"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    domain: "jacobsensalt.com",
    name: "Jacobsen Salt Co",
    interests: ["Cooking", "Food"],
    occasions: ["Housewarming", "Wedding", "Christmas", "Thank You"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    domain: "dandelionchocolate.com",
    name: "Dandelion Chocolate",
    interests: ["Food", "Cooking"],
    occasions: ["Valentine's Day", "Thank You", "Christmas", "Anniversary", "Diwali"],
    ageMin: 12,
    ageMax: 99,
  },

  // --- Glassware & table ---
  {
    domain: "estellecoloredglass.com",
    name: "Estelle Colored Glass",
    interests: ["Home Decor", "Food"],
    occasions: ["Wedding", "Housewarming", "Anniversary", "Christmas"],
    ageMin: 21,
    ageMax: 99,
  },

  // --- Beauty & skincare (second wave) ---
  {
    domain: "byoma.com",
    name: "Byoma",
    interests: ["Beauty", "Self-care", "Health"],
    occasions: ["Birthday", "Christmas", "Thank You", "Get Well Soon"],
    ageMin: 12,
    ageMax: 60,
  },
  {
    domain: "corpusnaturals.com",
    name: "Corpus",
    interests: ["Beauty", "Self-care", "Health"],
    occasions: ["Birthday", "Christmas", "Thank You"],
    ageMin: 16,
    ageMax: 70,
  },

  // --- Stationery ---
  {
    domain: "baronfig.com",
    name: "Baronfig",
    interests: ["Writing", "Creativity", "Personalized"],
    occasions: ["Graduation", "Birthday", "New Year", "Thank You"],
    ageMin: 14,
    ageMax: 90,
  },
  {
    domain: "appointed.co",
    name: "Appointed",
    interests: ["Writing", "Creativity", "Personalized"],
    occasions: ["Graduation", "New Year", "Birthday", "Thank You"],
    ageMin: 16,
    ageMax: 90,
  },

  /* ------------------------------------------------------------------ *
   * Gap-filling wave (endpoints verified 2026-08-14).
   *
   * The catalogue had skewed hard to beauty, fashion, fragrance and home —
   * Fashion sat at 2,615 gifts while Sports had 54 and Cars 43, and most thin
   * categories were fed by Etsy alone. Everything below targets a category with
   * under ~350 gifts, or under three sources feeding it.
   * ------------------------------------------------------------------ */

  // --- Games & puzzles (was 291 gifts across only 2 sources) ---
  {
    domain: "pieceworkpuzzles.com",
    name: "Piecework Puzzles",
    interests: ["Games", "Art", "Family"],
    occasions: ["Birthday", "Christmas", "Family Gathering", "Thank You"],
    ageMin: 8,
    ageMax: 90,
  },
  {
    domain: "artofplay.com",
    name: "Art of Play",
    interests: ["Games", "Creativity", "Art"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 10,
    ageMax: 80,
  },
  {
    domain: "galison.com",
    name: "Galison",
    interests: ["Games", "Art", "Family"],
    occasions: ["Birthday", "Christmas", "Family Gathering", "Housewarming"],
    ageMin: 8,
    ageMax: 90,
  },
  {
    domain: "printworksmarket.com",
    name: "Printworks",
    interests: ["Games", "Home Decor", "Creativity"],
    occasions: ["Birthday", "Christmas", "Housewarming", "Anniversary"],
    ageMin: 12,
    ageMax: 80,
  },

  // --- Outdoors (was 208) ---
  {
    domain: "stanley1913.com",
    name: "Stanley",
    interests: ["Outdoors", "Travel", "Fitness"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Graduation"],
    ageMin: 12,
    ageMax: 90,
  },
  {
    domain: "snowpeak.com",
    name: "Snow Peak",
    interests: ["Outdoors", "Cooking", "Travel"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Anniversary"],
    ageMin: 18,
    ageMax: 80,
  },
  {
    domain: "rumpl.com",
    name: "Rumpl",
    interests: ["Outdoors", "Travel", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Housewarming", "Father's Day"],
    ageMin: 14,
    ageMax: 85,
  },
  {
    domain: "barebonesliving.com",
    name: "Barebones",
    interests: ["Outdoors", "Gardening", "Cooking"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Housewarming"],
    ageMin: 18,
    ageMax: 85,
  },

  // --- Kids, toys & STEM (was 80) ---
  {
    domain: "melissaanddoug.com",
    name: "Melissa & Doug",
    interests: ["STEM", "Games", "Creativity", "Family"],
    occasions: ["Birthday", "Christmas", "Family Gathering"],
    ageMin: 2,
    ageMax: 12,
  },
  {
    domain: "plantoys.com",
    name: "PlanToys",
    interests: ["STEM", "Games", "Creativity"],
    occasions: ["Birthday", "Christmas", "Baby Shower"],
    ageMin: 1,
    ageMax: 10,
  },
  {
    domain: "tegu.com",
    name: "Tegu",
    interests: ["STEM", "Games", "Creativity"],
    occasions: ["Birthday", "Christmas", "Baby Shower"],
    ageMin: 1,
    ageMax: 12,
  },

  // --- Gardening (was 69, single source) ---
  {
    domain: "thesill.com",
    name: "The Sill",
    interests: ["Gardening", "Home Decor", "Self-care"],
    occasions: ["Housewarming", "Birthday", "Thank You", "Get Well Soon", "Mother's Day"],
    ageMin: 18,
    ageMax: 90,
  },
  {
    domain: "modernsprout.com",
    name: "Modern Sprout",
    interests: ["Gardening", "Home Decor", "Cooking"],
    occasions: ["Housewarming", "Birthday", "Christmas", "Thank You"],
    ageMin: 14,
    ageMax: 90,
  },

  // --- Fitness & recovery (was 83) ---
  {
    domain: "therabody.com",
    name: "Therabody",
    interests: ["Fitness", "Health", "Self-care"],
    occasions: ["Birthday", "Christmas", "Father's Day", "New Year"],
    ageMin: 18,
    ageMax: 80,
  },
  {
    domain: "manduka.com",
    name: "Manduka",
    interests: ["Fitness", "Health", "Self-care"],
    occasions: ["Birthday", "New Year", "Christmas", "Get Well Soon"],
    ageMin: 16,
    ageMax: 80,
  },
  {
    domain: "hyperice.com",
    name: "Hyperice",
    interests: ["Fitness", "Health", "Sports"],
    occasions: ["Birthday", "Christmas", "Father's Day", "New Year"],
    ageMin: 16,
    ageMax: 75,
  },

  // --- Reading (was 83) ---
  {
    domain: "juniperbooks.com",
    name: "Juniper Books",
    interests: ["Reading", "Home Decor", "Personalized"],
    occasions: ["Housewarming", "Christmas", "Wedding", "Graduation", "Anniversary"],
    ageMin: 18,
    ageMax: 90,
  },

  // --- Writing (was 352, thin on sources) ---
  {
    domain: "blackwing602.com",
    name: "Blackwing",
    interests: ["Writing", "Creativity", "Art"],
    occasions: ["Graduation", "Birthday", "New Year", "Thank You"],
    ageMin: 14,
    ageMax: 90,
  },

  // --- Coffee & kitchen (Coffee was 202) ---
  {
    domain: "atlascoffeeclub.com",
    name: "Atlas Coffee Club",
    interests: ["Coffee", "Food", "Travel"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Thank You"],
    ageMin: 18,
    ageMax: 90,
  },
  {
    domain: "misen.com",
    name: "Misen",
    interests: ["Cooking", "Food", "Home Decor"],
    occasions: ["Wedding", "Housewarming", "Christmas", "Anniversary"],
    ageMin: 18,
    ageMax: 85,
  },
  {
    domain: "fromourplace.com",
    name: "Our Place",
    interests: ["Cooking", "Home Decor", "Food"],
    occasions: ["Wedding", "Housewarming", "Christmas", "Anniversary", "Diwali"],
    ageMin: 18,
    ageMax: 85,
  },
  {
    domain: "brightland.co",
    name: "Brightland",
    interests: ["Food", "Cooking"],
    occasions: ["Housewarming", "Thank You", "Christmas", "Wedding"],
    ageMin: 21,
    ageMax: 90,
  },

  // --- Everyday & design ---
  {
    domain: "flyingtiger.com",
    name: "Flying Tiger",
    interests: ["Creativity", "Home Decor", "Games"],
    occasions: ["Birthday", "Christmas", "Thank You", "Housewarming"],
    ageMin: 6,
    ageMax: 80,
  },

  // --- Beauty (already the strongest category; these are high-recognition
  //     names rather than coverage, so they earn their place on demand) ---
  {
    domain: "rhodeskin.com",
    name: "Rhode",
    interests: ["Beauty", "Self-care"],
    occasions: ["Birthday", "Christmas", "Valentine's Day", "Graduation"],
    ageMin: 14,
    ageMax: 55,
  },
  {
    domain: "summerfridays.com",
    name: "Summer Fridays",
    interests: ["Beauty", "Self-care"],
    occasions: ["Birthday", "Christmas", "Thank You", "Mother's Day"],
    ageMin: 16,
    ageMax: 65,
  },
  {
    domain: "olaplex.com",
    name: "Olaplex",
    interests: ["Beauty", "Self-care"],
    occasions: ["Birthday", "Christmas", "Mother's Day"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "tatcha.com",
    name: "Tatcha",
    interests: ["Beauty", "Self-care", "Health"],
    occasions: ["Birthday", "Christmas", "Mother's Day", "Thank You"],
    ageMin: 18,
    ageMax: 75,
  },

  // --- Sneakers & streetwear (verified 2026-08-19) ---
  //
  // The ask was StockX and GOAT: Dunks, Jordans, the Travis Scott collabs.
  // Neither is reachable — GOAT answers robots.txt itself with a Cloudflare
  // challenge, and StockX's robots.txt disallows /api/ and */search* for every
  // user agent, so its only sanctioned route is a partner API behind a business
  // agreement. These are the boutiques that actually receive the Nike SNKRS
  // allocations, each serving its own public products.json, and between them
  // they carry the same silhouettes at retail rather than at resale.
  //
  // Note MAX_PRICE: hyped pairs trading above $600 are skipped, which is the
  // right outcome for a gift site — what survives is the $100-200 general
  // release, not a $1,400 Jordan 1 Travis Scott.
  {
    domain: "kith.com",
    name: "Kith",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "undefeated.com",
    name: "Undefeated",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "bdgastore.com",
    name: "Bodega",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "cncpts.com",
    name: "Concepts",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "a-ma-maniere.com",
    name: "A Ma Maniére",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation", "Anniversary"],
    ageMin: 16,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "sneakerpolitics.com",
    name: "Sneaker Politics",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "extrabutterny.com",
    name: "Extra Butter",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "socialstatuspgh.com",
    name: "Social Status",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "notre-shop.com",
    name: "Notre",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 16,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "packershoes.com",
    name: "Packer",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "renarts.com",
    name: "Renarts",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "lapstoneandhammer.com",
    name: "Lapstone & Hammer",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 16,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "solefly.com",
    name: "SoleFly",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "wishatl.com",
    name: "Wish ATL",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "xhibition.co",
    name: "Xhibition",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "shoepalace.com",
    name: "Shoe Palace",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 10,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "shoegallerymiami.com",
    name: "Shoe Gallery",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 45,
    prefer: FOOTWEAR,
  },
  {
    domain: "dtlr.com",
    name: "DTLR",
    interests: ["Sneakers", "Fashion", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 45,
    prefer: FOOTWEAR,
  },

  // --- Lighting & LED (verified 2026-08-19) ---
  //
  // The "cool LEDs" half of the IKEA ask. IKEA itself has no public product
  // feed: no products.json, no developer API, and its robots.txt disallows
  // every search path an importer would have to walk, so the only route in
  // would be its undocumented internal endpoint against that stated policy.
  {
    domain: "lifx.com",
    name: "LIFX",
    interests: ["Tech", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Housewarming", "New Year"],
    ageMin: 14,
    ageMax: 65,
  },
  {
    domain: "twinkly.com",
    name: "Twinkly",
    interests: ["Tech", "Home Decor", "Creativity"],
    occasions: ["Christmas", "Birthday", "Housewarming", "New Year", "Diwali"],
    ageMin: 12,
    ageMax: 70,
  },
  {
    domain: "nanoleaf.me",
    name: "Nanoleaf",
    interests: ["Tech", "Home Decor", "Gaming"],
    occasions: ["Birthday", "Christmas", "Housewarming", "Graduation"],
    ageMin: 12,
    ageMax: 55,
  },
  {
    domain: "lepro.com",
    name: "Lepro",
    interests: ["Tech", "Home Decor", "Gaming"],
    occasions: ["Birthday", "Christmas", "Housewarming"],
    ageMin: 12,
    ageMax: 60,
  },
  {
    domain: "divoom.com",
    name: "Divoom",
    interests: ["Tech", "Gaming", "Art", "Music"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 10,
    ageMax: 45,
  },
  {
    domain: "brightech.com",
    name: "Brightech",
    interests: ["Home Decor", "Reading"],
    occasions: ["Housewarming", "Christmas", "Birthday", "Wedding"],
    ageMin: 18,
    ageMax: 80,
  },
  {
    domain: "colorcord.com",
    name: "Color Cord Company",
    interests: ["Home Decor", "Creativity"],
    occasions: ["Housewarming", "Wedding", "Christmas"],
    ageMin: 20,
    ageMax: 75,
  },
  {
    domain: "schoolhouse.com",
    name: "Schoolhouse",
    interests: ["Home Decor"],
    occasions: ["Housewarming", "Wedding", "Anniversary", "Christmas"],
    ageMin: 22,
    ageMax: 80,
  },

  // --- Small furniture & storage (verified 2026-08-19) ---
  {
    domain: "umbra.com",
    name: "Umbra",
    interests: ["Home Decor", "Creativity"],
    occasions: ["Housewarming", "Birthday", "Christmas", "Wedding"],
    ageMin: 16,
    ageMax: 75,
  },
  {
    domain: "floydhome.com",
    name: "Floyd",
    interests: ["Home Decor"],
    occasions: ["Housewarming", "Wedding", "Graduation", "Christmas"],
    ageMin: 20,
    ageMax: 60,
  },
  {
    domain: "bendgoods.com",
    name: "Bend Goods",
    interests: ["Home Decor", "Outdoors"],
    occasions: ["Housewarming", "Wedding", "Anniversary"],
    ageMin: 22,
    ageMax: 75,
  },
  {
    domain: "sixpenny.com",
    name: "Sixpenny",
    interests: ["Home Decor", "Self-care"],
    occasions: ["Housewarming", "Wedding", "Anniversary"],
    ageMin: 22,
    ageMax: 75,
  },

  // --- Desk tech & gadgets (verified 2026-08-19) ---
  //
  // The other half of the IKEA ask: the cheap tech someone picks up on the way
  // out. Mostly sub-$100, which is the band the quiz's busiest budget presets
  // ask for.
  {
    domain: "keychron.com",
    name: "Keychron",
    interests: ["Tech", "Gaming", "Writing"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day"],
    ageMin: 14,
    ageMax: 60,
  },
  {
    domain: "lofree.co",
    name: "Lofree",
    interests: ["Tech", "Creativity", "Writing"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 55,
  },
  {
    domain: "twelvesouth.com",
    name: "Twelve South",
    interests: ["Tech"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "us.anker.com",
    name: "Anker",
    interests: ["Tech", "Travel"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day"],
    ageMin: 14,
    ageMax: 75,
  },
  {
    domain: "satechi.net",
    name: "Satechi",
    interests: ["Tech"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "moft.us",
    name: "MOFT",
    interests: ["Tech", "Travel"],
    occasions: ["Birthday", "Christmas", "Graduation", "Thank You"],
    ageMin: 14,
    ageMax: 65,
  },
  {
    domain: "nativeunion.com",
    name: "Native Union",
    interests: ["Tech", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 16,
    ageMax: 65,
  },
  {
    domain: "orbitkey.com",
    name: "Orbitkey",
    interests: ["Tech", "Travel", "Personalized"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Graduation"],
    ageMin: 16,
    ageMax: 70,
  },
  {
    domain: "elago.com",
    name: "elago",
    interests: ["Tech", "Creativity"],
    occasions: ["Birthday", "Christmas", "Thank You"],
    ageMin: 12,
    ageMax: 55,
  },
  {
    domain: "baseus.com",
    name: "Baseus",
    interests: ["Tech", "Travel"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 65,
  },
  {
    domain: "sharge.com",
    name: "Sharge",
    interests: ["Tech", "Gaming"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 50,
  },
  {
    domain: "ugmonk.com",
    name: "Ugmonk",
    interests: ["Tech", "Writing", "Creativity"],
    occasions: ["Birthday", "Christmas", "Graduation", "Thank You"],
    ageMin: 18,
    ageMax: 65,
  },
  {
    domain: "jlab.com",
    name: "JLab",
    interests: ["Music", "Tech", "Fitness"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 60,
  },
  {
    domain: "skullcandy.com",
    name: "Skullcandy",
    interests: ["Music", "Tech", "Sports"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 50,
  },
  {
    domain: "rayconglobal.com",
    name: "Raycon",
    interests: ["Music", "Tech", "Fitness"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 14,
    ageMax: 55,
  },

  // --- Pets (verified 2026-08-19) ---
  //
  // The catalogue had 24 pet products in 9,866 rows, which is close to nothing
  // for one of the largest gifting categories there is — people buy for other
  // people's dogs constantly. The `Pets` interest exists because of these.
  {
    domain: "wildone.com",
    name: "Wild One",
    interests: ["Pets", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Housewarming", "Thank You"],
    ageMin: 18,
    ageMax: 75,
  },
  {
    domain: "maxbone.com",
    name: "Maxbone",
    interests: ["Pets", "Fashion"],
    occasions: ["Birthday", "Christmas", "Housewarming"],
    ageMin: 18,
    ageMax: 70,
  },
  {
    domain: "thefoggydog.com",
    name: "The Foggy Dog",
    interests: ["Pets", "Home Decor", "Personalized"],
    occasions: ["Birthday", "Christmas", "Housewarming", "Thank You"],
    ageMin: 18,
    ageMax: 75,
  },
  {
    domain: "lambwolf.co",
    name: "Lambwolf Collective",
    interests: ["Pets", "Creativity"],
    occasions: ["Birthday", "Christmas", "Thank You"],
    ageMin: 18,
    ageMax: 65,
  },
  {
    domain: "diggs.pet",
    name: "Diggs",
    interests: ["Pets", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Housewarming", "New Year"],
    ageMin: 18,
    ageMax: 70,
  },
  {
    domain: "pupford.com",
    name: "Pupford",
    interests: ["Pets", "Health"],
    occasions: ["Birthday", "Christmas", "Thank You"],
    ageMin: 18,
    ageMax: 75,
  },

  // --- Barware & spirits accessories (verified 2026-08-19) ---
  //
  // 52 rows before this. Deliberately *not* given a new interest: unlike
  // sneakers and pets, this already has a home under Cooking, Food and Home
  // Decor, and a chip per category is how a six-question quiz turns into a
  // form.
  {
    domain: "viski.com",
    name: "Viski",
    interests: ["Cooking", "Home Decor", "Food"],
    occasions: ["Christmas", "Birthday", "Housewarming", "Father's Day", "Wedding"],
    ageMin: 21,
    ageMax: 75,
  },
  {
    domain: "cocktailkingdom.com",
    name: "Cocktail Kingdom",
    interests: ["Cooking", "Food", "Creativity"],
    occasions: ["Christmas", "Birthday", "Housewarming", "Father's Day"],
    ageMin: 21,
    ageMax: 75,
  },
  {
    domain: "elevatedcraft.com",
    name: "Elevated Craft",
    interests: ["Cooking", "Food", "Outdoors"],
    occasions: ["Christmas", "Birthday", "Father's Day", "Housewarming"],
    ageMin: 21,
    ageMax: 70,
  },
  {
    domain: "thewhiskeyball.com",
    name: "The Whiskey Ball",
    interests: ["Food", "Home Decor", "Personalized"],
    occasions: ["Christmas", "Birthday", "Father's Day", "Anniversary", "Retirement"],
    ageMin: 21,
    ageMax: 80,
  },
  {
    domain: "wandpdesign.com",
    name: "W&P",
    interests: ["Cooking", "Food", "Home Decor"],
    occasions: ["Housewarming", "Christmas", "Birthday", "Wedding"],
    ageMin: 18,
    ageMax: 70,
  },
  {
    domain: "corkcicle.com",
    name: "Corkcicle",
    interests: ["Food", "Travel", "Outdoors"],
    occasions: ["Birthday", "Christmas", "Father's Day", "Thank You", "Graduation"],
    ageMin: 14,
    ageMax: 80,
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

/** Guards against a typo creating a taxonomy value the quiz can never select. */
function assertTaxonomyValid() {
  const badInterests = new Set<string>();
  const badOccasions = new Set<string>();

  for (const b of BRANDS) {
    b.interests.filter((i) => !INTERESTS.includes(i as never)).forEach((i) => badInterests.add(i));
    b.occasions.filter((o) => !OCCASIONS.includes(o as never)).forEach((o) => badOccasions.add(o));
  }

  if (badInterests.size || badOccasions.size) {
    throw new Error(
      `BRANDS reference values missing from lib/gift-options.ts — ` +
        `interests: [${[...badInterests].join(", ")}], occasions: [${[...badOccasions].join(", ")}]`,
    );
  }
}

/** Truncate by code point so an emoji or accent never gets split mid-character. */
function truncateText(text: string, maxLength: number): string {
  const NUL = String.fromCharCode(0);
  const clean = text.split(NUL).join("");
  const codePoints = [...clean];
  return codePoints.length <= maxLength ? clean : codePoints.slice(0, maxLength).join("");
}

/** Gift cards, samples and shipping-protection line items aren't gifts. */
const EXCLUDED = /gift card|e-?gift|sample|swatch|shipping protection|warranty|donation|test product/i;

function stage(
  product: ShopifyProduct,
  brand: Brand,
  staged: Map<string, StagedGift>,
  derived: Record<string, number>,
): string | null {
  const title = (product.title ?? "").trim();
  const variant = pickVariant(product);
  const imageUrl = pickImageUrl(product);

  if (!title) return "missing title";
  if (!product.handle) return "missing handle";
  if (EXCLUDED.test(title)) return "excluded product type";
  if (!variant) return "no variants";
  if (!variant.available) return "out of stock";
  if (!imageUrl) return "no image";

  // Shopify sends money as a decimal string.
  const price = Number.parseFloat(variant.price);
  if (!Number.isFinite(price) || price <= 0) return "bad price";
  if (price < MIN_PRICE) return `under $${MIN_PRICE}`;
  if (price > MAX_PRICE) return `over $${MAX_PRICE}`;

  const url = productUrl(brand.domain, product.handle);
  if (staged.has(url)) return null;

  const description = htmlToText(product.body_html ?? "");

  // Per-product tags where the listing says enough to earn them, brand-level
  // tags where it doesn't. These reach the database on create only — an
  // existing row's interests, age range and gender belong to `enrich:tags` and
  // the upsert below never writes them on update.
  const rule = deriveTags({
    title,
    productType: product.product_type,
    tags: product.tags,
  });
  if (rule) derived[rule.label] = (derived[rule.label] ?? 0) + 1;

  // A rule that only established gender leaves the interests alone. The brand's
  // guess is still better than nothing, and better than a category this table
  // doesn't cover.
  const interests = rule && rule.interests.length > 0 ? rule.interests : brand.interests;

  staged.set(url, {
    name: truncateText(title, 140),
    description: truncateText(description, 400) || title,
    price,
    // products.json carries no currency field; every brand here is a US
    // storefront selling in USD. Re-check before adding non-US merchants.
    currency: "USD",
    // A brand-level gender is a curator's decision about the whole catalogue,
    // so it outranks a word in one title. Otherwise take what the listing
    // states outright, and fall back to unisex — which is what keeps a product
    // eligible for every search rather than half of them.
    gender: brand.gender ?? rule?.gender ?? "unisex",
    imageUrl,
    productUrl: url,
    platform: brand.name,
    occasions: new Set(brand.occasions),
    interests: new Set(interests),
    ageMin: brand.ageMin,
    ageMax: brand.ageMax,
  });
  return null;
}

async function main() {
  assertTaxonomyValid();
  assertRulesValid();

  const staged = new Map<string, StagedGift>();
  const skipped: Record<string, number> = {};
  /** Which derivation rule tagged each product, for the run summary. */
  const derived: Record<string, number> = {};
  let fetched = 0;

  for (const brand of BRANDS) {
    let brandCount = 0;

    const take = (products: ShopifyProduct[]) => {
      for (const product of products) {
        if (brandCount >= MAX_PER_BRAND) break;
        const before = staged.size;
        const reason = stage(product, brand, staged, derived);
        if (reason) {
          skipped[reason] = (skipped[reason] ?? 0) + 1;
        } else if (staged.size > before) {
          brandCount++;
        }
      }
    };

    try {
      if (brand.prefer) {
        // A preference can only be applied to the whole feed, so read every
        // page before choosing. Preferred products keep their feed order among
        // themselves — newest first, as everywhere else — and the rest follow
        // to fill whatever slots are left.
        const all: ShopifyProduct[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
          const products = await fetchProductsPage(brand.domain, page);
          if (products.length === 0) break;
          fetched += products.length;
          all.push(...products);
          await sleep(REQUEST_DELAY_MS);
        }

        const matches = (product: ShopifyProduct) =>
          brand.prefer!.test(`${product.product_type ?? ""} ${product.title}`);

        take(all.filter(matches));
        take(all.filter((product) => !matches(product)));
      } else {
        for (let page = 1; page <= MAX_PAGES && brandCount < MAX_PER_BRAND; page++) {
          const products = await fetchProductsPage(brand.domain, page);
          if (products.length === 0) break;
          fetched += products.length;
          take(products);
          await sleep(REQUEST_DELAY_MS);
        }
      }
      console.log(`  ${brand.name.padEnd(24)} → ${brandCount} gifts`);
    } catch (error) {
      const detail = error instanceof ShopifyFeedError ? `${error.status}` : error;
      console.error(`  ${brand.name.padEnd(24)} FAILED — ${detail}`);
    }
  }

  console.log(
    `\nRead ${fetched} products across ${BRANDS.length} brands → ${staged.size} gifts.`,
  );
  if (Object.keys(skipped).length) {
    console.log("Skipped:");
    for (const [reason, count] of Object.entries(skipped)) console.log(`  ${count} × ${reason}`);
  }

  const tagged = Object.values(derived).reduce((n, c) => n + c, 0);
  console.log(
    `\nPer-product tags derived for ${tagged} of ${staged.size} ` +
      `(${Math.round((100 * tagged) / Math.max(staged.size, 1))}%); the rest keep their brand's tags.`,
  );
  for (const [label, count] of Object.entries(derived).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)} × ${label}`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Sample:");
    for (const gift of [...staged.values()].slice(0, 12)) {
      console.log(
        `  ${gift.platform.padEnd(22)} ${gift.name.slice(0, 46).padEnd(46)} $${gift.price.toFixed(2).padStart(7)}`,
      );
    }
    return;
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  let upserted = 0;
  try {
    for (const gift of staged.values()) {
      // What the merchant owns: it changes on their side and should always be
      // refreshed. Prices move, images get replaced, titles get rewritten.
      const listing = {
        name: gift.name,
        description: gift.description,
        price: gift.price,
        currency: gift.currency,
        imageUrl: gift.imageUrl,
        productUrl: gift.productUrl,
        platform: gift.platform,
        // Curated here rather than derived per product, so this file stays the
        // source of truth for it and a re-import is how you widen coverage.
        occasions: [...gift.occasions],
      };

      // What `enrich:tags` owns once it has run. These are brand-level guesses
      // — every product from one brand gets the same three values — and the
      // tagging pass replaces them with per-product judgments.
      //
      // So they are written on create and never on update. Before this split,
      // `update` carried them too, and re-running the importer silently reverted
      // every enriched row to its brand default: 4,050 rows across 71 brands,
      // undoing a paid Batch API run without printing a word about it.
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
