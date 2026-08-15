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

const DRY_RUN = process.argv.includes("--dry-run");

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
}

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
    interests: ["Beauty", "Self-care", "Health"],
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

  staged.set(url, {
    name: truncateText(title, 140),
    description: truncateText(description, 400) || title,
    price,
    // products.json carries no currency field; every brand here is a US
    // storefront selling in USD. Re-check before adding non-US merchants.
    currency: "USD",
    gender: brand.gender ?? "unisex",
    imageUrl,
    productUrl: url,
    platform: brand.name,
    occasions: new Set(brand.occasions),
    interests: new Set(brand.interests),
    ageMin: brand.ageMin,
    ageMax: brand.ageMax,
  });
  return null;
}

async function main() {
  assertTaxonomyValid();

  const staged = new Map<string, StagedGift>();
  const skipped: Record<string, number> = {};
  let fetched = 0;

  for (const brand of BRANDS) {
    let brandCount = 0;
    try {
      for (let page = 1; page <= MAX_PAGES && brandCount < MAX_PER_BRAND; page++) {
        const products = await fetchProductsPage(brand.domain, page);
        if (products.length === 0) break;
        fetched += products.length;

        for (const product of products) {
          if (brandCount >= MAX_PER_BRAND) break;
          const before = staged.size;
          const reason = stage(product, brand, staged);
          if (reason) {
            skipped[reason] = (skipped[reason] ?? 0) + 1;
          } else if (staged.size > before) {
            brandCount++;
          }
        }

        await sleep(REQUEST_DELAY_MS);
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
      const data = {
        name: gift.name,
        description: gift.description,
        price: gift.price,
        currency: gift.currency,
        gender: gift.gender,
        imageUrl: gift.imageUrl,
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
