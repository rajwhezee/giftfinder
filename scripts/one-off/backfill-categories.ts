/**
 * Fills Gift.category for rows imported before the column existed.
 *
 * The rules normally read `product_type` alongside the title, and that column
 * is not stored — so this has only the title to go on, which is exactly the
 * setup that produced nonsense the last time: sneaker colourways like "BLACK
 * COFFEE" and "Cow Print" match coffee and wall-art rules.
 *
 * The stored interests are the guard. "Sneakers" is only ever applied by the
 * footwear rule, so any row carrying it is footwear no matter what its
 * colourway says, and it is pinned to Shoes before the title is consulted.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { deriveTags } from "../../lib/product-tags";

const APPLY = process.argv.includes("--apply");

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
  const rows = await prisma.gift.findMany({
    where: { category: null },
    select: { id: true, name: true, interests: true },
  });

  const updates: { id: string; category: string }[] = [];
  for (const r of rows) {
    const category = r.interests.includes("Sneakers")
      ? "Shoes"
      : (deriveTags({ title: r.name })?.category ?? null);
    if (category) updates.push({ id: r.id, category });
  }

  const counts: Record<string, number> = {};
  for (const u of updates) counts[u.category] = (counts[u.category] ?? 0) + 1;
  console.log(`${rows.length} uncategorised rows -> ${updates.length} matched (${Math.round((100 * updates.length) / rows.length)}%)`);
  for (const [c, n] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(5)}  ${c}`);
  }

  if (!APPLY) { console.log("\npreview only; pass --apply to write."); await prisma.$disconnect(); return; }
  for (const u of updates) await prisma.gift.update({ where: { id: u.id }, data: { category: u.category } });
  console.log(`\nwrote ${updates.length}.`);
  await prisma.$disconnect();
}
main();
