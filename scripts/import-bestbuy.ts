/**
 * Imports real Best Buy products into the Gift table.
 *
 * Same shape as scripts/import-etsy.ts: curation lives in QUERIES below, so a
 * result's meaning is something we control rather than something inferred from
 * free text. Best Buy fills the gap Etsy can't — recognisable brand-name
 * electronics (Sony, Bose, Apple, Nintendo, Dyson) across every price tier.
 *
 * Usage:
 *   npm run import:bestbuy -- --dry-run     inspect what would be imported
 *   npm run import:bestbuy                  write to the database
 */

// tsx does not read .env on its own, so API_KEY below would be undefined
// without this. Same pattern as prisma.config.ts.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  BestBuyApiError,
  pickImageUrl,
  searchProducts,
  type BestBuyProduct,
} from "../lib/bestbuy";
import { INTERESTS, OCCASIONS } from "../lib/gift-options";

const API_KEY = process.env.BESTBUY_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

/** Best Buy warns about QPS errors; stay well clear. */
const REQUEST_DELAY_MS = 500;
const PER_QUERY_LIMIT = 50;

/** Quality floor — avoids obscure accessories with no social proof. */
const MIN_REVIEW_COUNT = 15;
const MIN_REVIEW_AVERAGE = 4;

interface CuratedQuery {
  label: string;
  /** Best Buy query expression, without outer parentheses. */
  query: string;
  interests: string[];
  occasions: string[];
  ageMin: number;
  ageMax: number;
  gender?: "male" | "female";
}

const QUERIES: CuratedQuery[] = [
  {
    label: "Wireless headphones",
    query: "search=wireless headphones&salePrice>60&salePrice<450",
    interests: ["Music", "Tech", "Travel"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day"],
    ageMin: 13,
    ageMax: 99,
  },
  {
    label: "Bluetooth speakers",
    query: "search=portable bluetooth speaker&salePrice>40&salePrice<400",
    interests: ["Music", "Tech", "Outdoors"],
    occasions: ["Birthday", "Christmas", "Housewarming"],
    ageMin: 12,
    ageMax: 99,
  },
  {
    label: "Smartwatches & fitness",
    query: "search=smartwatch&salePrice>80&salePrice<600",
    interests: ["Fitness", "Tech", "Health"],
    occasions: ["Birthday", "Christmas", "New Year", "Graduation"],
    ageMin: 14,
    ageMax: 80,
  },
  {
    label: "Fitness trackers",
    query: "search=fitness tracker&salePrice>40&salePrice<300",
    interests: ["Fitness", "Health", "Tech"],
    occasions: ["Birthday", "New Year", "Christmas"],
    ageMin: 14,
    ageMax: 80,
  },
  {
    label: "Nintendo Switch games & gear",
    query: "search=nintendo switch&salePrice>25&salePrice<400",
    interests: ["Gaming", "Games", "Family"],
    occasions: ["Birthday", "Christmas", "Family Gathering"],
    ageMin: 8,
    ageMax: 45,
  },
  {
    label: "Gaming accessories",
    query: "search=gaming headset&salePrice>30&salePrice<350",
    interests: ["Gaming", "Tech"],
    occasions: ["Birthday", "Christmas", "Graduation"],
    ageMin: 12,
    ageMax: 45,
  },
  {
    label: "Espresso & coffee machines",
    query: "search=espresso machine&salePrice>60&salePrice<900",
    interests: ["Coffee", "Cooking", "Home Decor"],
    occasions: ["Wedding", "Housewarming", "Christmas", "Anniversary"],
    ageMin: 21,
    ageMax: 99,
  },
  {
    label: "Kitchen appliances",
    query: "search=stand mixer&salePrice>80&salePrice<800",
    interests: ["Cooking", "Food"],
    occasions: ["Wedding", "Housewarming", "Christmas", "Mother's Day"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    label: "Air fryers",
    query: "search=air fryer&salePrice>50&salePrice<400",
    interests: ["Cooking", "Food"],
    occasions: ["Housewarming", "Wedding", "Christmas"],
    ageMin: 18,
    ageMax: 99,
  },
  {
    label: "Instant & digital cameras",
    query: "search=instant camera&salePrice>50&salePrice<400",
    interests: ["Photography", "Creativity", "Travel"],
    occasions: ["Birthday", "Graduation", "Christmas"],
    ageMin: 10,
    ageMax: 60,
  },
  {
    label: "Cameras",
    query: "search=digital camera&salePrice>200&salePrice<2000",
    interests: ["Photography", "Creativity", "Travel"],
    occasions: ["Graduation", "Birthday", "Christmas", "Retirement"],
    ageMin: 16,
    ageMax: 99,
  },
  {
    label: "E-readers & tablets",
    query: "search=e-reader&salePrice>60&salePrice<500",
    interests: ["Reading", "Tech", "Travel"],
    occasions: ["Birthday", "Christmas", "Graduation", "Retirement"],
    ageMin: 12,
    ageMax: 99,
  },
  {
    label: "Skincare & beauty tech",
    query: "search=hair dryer&salePrice>80&salePrice<700",
    interests: ["Beauty", "Self-care"],
    occasions: ["Birthday", "Mother's Day", "Christmas", "Valentine's Day"],
    ageMin: 16,
    ageMax: 99,
    gender: "female",
  },
  {
    label: "Electric shavers & grooming",
    query: "search=electric shaver&salePrice>40&salePrice<500",
    interests: ["Self-care", "Beauty"],
    occasions: ["Father's Day", "Birthday", "Christmas"],
    ageMin: 16,
    ageMax: 99,
    gender: "male",
  },
  {
    label: "Robot vacuums & home",
    query: "search=robot vacuum&salePrice>150&salePrice<1200",
    interests: ["Home Decor", "Tech"],
    occasions: ["Housewarming", "Wedding", "Christmas"],
    ageMin: 21,
    ageMax: 99,
  },
  {
    label: "Smart home",
    query: "search=smart speaker&salePrice>25&salePrice<400",
    interests: ["Tech", "Home Decor", "Music"],
    occasions: ["Housewarming", "Christmas", "Birthday"],
    ageMin: 16,
    ageMax: 99,
  },
  {
    label: "Turntables & vinyl",
    query: "search=turntable&salePrice>80&salePrice<900",
    interests: ["Music", "Home Decor"],
    occasions: ["Birthday", "Christmas", "Anniversary", "Graduation"],
    ageMin: 16,
    ageMax: 99,
  },
  {
    label: "Drones",
    query: "search=drone&salePrice>100&salePrice<1500",
    interests: ["Photography", "Tech", "Outdoors"],
    occasions: ["Birthday", "Graduation", "Christmas"],
    ageMin: 16,
    ageMax: 99,
  },
  {
    label: "Kids' STEM & learning",
    query: "search=kids tablet&salePrice>50&salePrice<300",
    interests: ["STEM", "Games", "Creativity"],
    occasions: ["Birthday", "Christmas"],
    ageMin: 4,
    ageMax: 12,
  },
  {
    label: "LEGO & building sets",
    query: "search=lego&salePrice>20&salePrice<500",
    interests: ["Games", "STEM", "Creativity"],
    occasions: ["Birthday", "Christmas", "Family Gathering"],
    ageMin: 5,
    ageMax: 45,
  },
  {
    label: "Portable chargers & travel tech",
    query: "search=portable charger&salePrice>25&salePrice<200",
    interests: ["Tech", "Travel"],
    occasions: ["Birthday", "Christmas", "Graduation", "Father's Day"],
    ageMin: 13,
    ageMax: 99,
  },
  {
    label: "Premium audio",
    query: "search=noise cancelling headphones&salePrice>250&salePrice<1200",
    interests: ["Music", "Tech", "Travel"],
    occasions: ["Anniversary", "Graduation", "Christmas", "Retirement"],
    ageMin: 16,
    ageMax: 99,
  },
];

interface StagedGift {
  sku: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  gender: "male" | "female" | "unisex";
  imageUrl: string;
  affiliateUrl: string;
  platform: string;
  occasions: Set<string>;
  interests: Set<string>;
  ageMin: number;
  ageMax: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Guards against a typo in QUERIES creating a taxonomy value the quiz can never select. */
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

/** Truncate by code point so an emoji or accent never gets split mid-character. */
function truncateText(text: string, maxLength: number): string {
  const NUL = String.fromCharCode(0);
  const clean = text.split(NUL).join("");
  const codePoints = [...clean];
  return codePoints.length <= maxLength ? clean : codePoints.slice(0, maxLength).join("");
}

function stage(
  product: BestBuyProduct,
  query: CuratedQuery,
  staged: Map<string, StagedGift>,
): string | null {
  const imageUrl = pickImageUrl(product);
  const name = (product.name ?? "").trim();
  const url = (product.url ?? "").trim();
  const price = product.salePrice;

  if (!name) return "missing name";
  if (!url) return "missing url";
  if (!imageUrl) return "no image";
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return "bad price";
  if (product.onlineAvailability === false) return "not available online";

  // Social proof floor — Best Buy carries a long tail of no-name accessories.
  const reviews = product.customerReviewCount ?? 0;
  const rating = product.customerReviewAverage ?? 0;
  if (reviews < MIN_REVIEW_COUNT) return `under ${MIN_REVIEW_COUNT} reviews`;
  if (rating < MIN_REVIEW_AVERAGE) return `rated under ${MIN_REVIEW_AVERAGE} stars`;

  const existing = staged.get(url);
  if (existing) {
    // Same product surfaced by another query — merge taxonomy, widen age range,
    // and collapse conflicting gender signals to unisex.
    query.interests.forEach((i) => existing.interests.add(i));
    query.occasions.forEach((o) => existing.occasions.add(o));
    existing.ageMin = Math.min(existing.ageMin, query.ageMin);
    existing.ageMax = Math.max(existing.ageMax, query.ageMax);
    const queryGender = query.gender ?? "unisex";
    if (existing.gender !== queryGender) existing.gender = "unisex";
    return null;
  }

  const description = (product.shortDescription ?? "").replace(/\s+/g, " ").trim();

  staged.set(url, {
    sku: product.sku,
    name: truncateText(name, 140),
    description: truncateText(description, 400) || name,
    price,
    currency: "USD",
    gender: query.gender ?? "unisex",
    imageUrl,
    affiliateUrl: url,
    platform: "Best Buy",
    occasions: new Set(query.occasions),
    interests: new Set(query.interests),
    ageMin: query.ageMin,
    ageMax: query.ageMax,
  });
  return null;
}

async function main() {
  if (!API_KEY) {
    console.error(
      "BESTBUY_API_KEY is not set. Add it to .env (not .env.example, which is committed):\n" +
        '  BESTBUY_API_KEY="..."\n' +
        "Get a free key at https://developer.bestbuy.com/ — no affiliate membership needed.",
    );
    process.exitCode = 1;
    return;
  }

  assertTaxonomyValid();

  const staged = new Map<string, StagedGift>();
  const skipped: Record<string, number> = {};
  let fetched = 0;

  for (const query of QUERIES) {
    try {
      const res = await searchProducts(API_KEY, {
        query: query.query,
        pageSize: PER_QUERY_LIMIT,
        // Best-reviewed first, so the quality floor trims the tail not the head.
        sort: "customerReviewCount.dsc",
      });
      const products = res.products ?? [];
      fetched += products.length;

      for (const product of products) {
        const reason = stage(product, query, staged);
        if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
      }

      console.log(`  ${query.label.padEnd(32)} → ${products.length} of ${res.total} total`);
    } catch (error) {
      if (error instanceof BestBuyApiError) {
        console.error(`  ${query.label} FAILED ${error.status}: ${error.body.slice(0, 180)}`);
      } else {
        console.error(`  ${query.label} FAILED:`, error);
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `\nFetched ${fetched} products across ${QUERIES.length} queries → ${staged.size} unique gifts.`,
  );
  if (Object.keys(skipped).length) {
    console.log("Skipped:");
    for (const [reason, count] of Object.entries(skipped)) console.log(`  ${count} × ${reason}`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Sample:");
    for (const gift of [...staged.values()].slice(0, 10)) {
      console.log(
        `  ${gift.name.slice(0, 58).padEnd(58)} $${gift.price.toFixed(2).padStart(8)}  ` +
          `[${[...gift.interests].join(", ")}]`,
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
        affiliateUrl: gift.affiliateUrl,
        platform: gift.platform,
        occasions: [...gift.occasions],
        interests: [...gift.interests],
        ageMin: gift.ageMin,
        ageMax: gift.ageMax,
      };
      await prisma.gift.upsert({
        where: { affiliateUrl: gift.affiliateUrl },
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
