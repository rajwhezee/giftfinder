/**
 * Fills `Gift.brand` for marketplace rows from their listing titles.
 *
 *   npx tsx scripts/backfill-brands.ts [--dry-run] [--platform eBay]
 *
 * Only eBay by default. The ~140 Shopify storefronts already carry the brand in
 * `platform`, so writing it twice would just be a column to keep in sync, and
 * Etsy listings are independent sellers with no brand to find — both are left
 * null and the UI falls back to `platform`.
 *
 * Safe to re-run. It rewrites `brand` from the current vocabulary every time,
 * which is the point: extending lib/brand-from-title.ts and running this again
 * is how coverage improves. Nothing else on the row is touched, so this cannot
 * disturb the interests, age range and gender that enrich-tags owns.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { brandFromTitle } from "@/lib/brand-from-title";

const DRY_RUN = process.argv.includes("--dry-run");

const platformArg = process.argv.indexOf("--platform");
const PLATFORMS = platformArg === -1 ? ["eBay"] : [process.argv[platformArg + 1]];

/** Postgres round trips dominate this, so writes go in batches by value. */
const BATCH = 200;

async function main() {
  console.log(`Backfilling brands for ${PLATFORMS.join(", ")}${DRY_RUN ? " (dry run)" : ""}\n`);

  const rows = await prisma.gift.findMany({
    where: { platform: { in: PLATFORMS } },
    select: { id: true, name: true, brand: true },
  });

  const byBrand = new Map<string, string[]>();
  let unmatched = 0;
  let unchanged = 0;

  for (const row of rows) {
    const brand = brandFromTitle(row.name);
    if (!brand) {
      unmatched++;
      continue;
    }
    if (brand === row.brand) unchanged++;
    const ids = byBrand.get(brand) ?? [];
    ids.push(row.id);
    byBrand.set(brand, ids);
  }

  const matched = rows.length - unmatched;
  console.log(
    `${rows.length} rows, ${matched} matched (${((matched / rows.length) * 100).toFixed(1)}%), ` +
      `${byBrand.size} distinct brands, ${unchanged} already correct`,
  );

  console.log("\nTop brands:");
  for (const [brand, ids] of [...byBrand].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
    console.log(`  ${brand.padEnd(22)} ${ids.length}`);
  }

  if (DRY_RUN) {
    console.log("\nDry run, nothing written.");
    await prisma.$disconnect();
    return;
  }

  // Clear first, then write. A row that used to match and no longer does had
  // its title changed by a re-import, or lost the vocabulary entry that caught
  // it, and a stale brand is worse than none. Doing it as one sweep avoids
  // sending a `notIn` list of every matched id, which for a full run is
  // thousands of cuids in a single statement.
  const cleared = await prisma.gift.updateMany({
    where: { platform: { in: PLATFORMS }, brand: { not: null } },
    data: { brand: null },
  });

  let written = 0;
  for (const [brand, ids] of byBrand) {
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      await prisma.gift.updateMany({ where: { id: { in: slice } }, data: { brand } });
      written += slice.length;
    }
  }

  console.log(`\nCleared ${cleared.count}, wrote ${written} brands.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
