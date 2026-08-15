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
import { INTERESTS, OCCASIONS } from "../lib/gift-options";

const CLIENT_ID = process.env.EBAY_CLIENT_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const DRY_RUN = process.argv.includes("--dry-run");

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
