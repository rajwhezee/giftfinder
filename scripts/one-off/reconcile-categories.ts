/**
 * Re-derives Gift.category, and clears it where it still contradicts the row's
 * interests.
 *
 * The original backfill had only titles to work with — product_type is not
 * stored — and overreached on Etsy jewellery: "Pendant Necklace" became Lamps,
 * "Big Face Mouse Charm" became Keyboards, "Supercar Back Print Shirt" became
 * Wall Art. 890 rows ended up on a shelf that contradicted their own tags.
 *
 * Interests are the arbiter here, not the category. They came from a Claude
 * pass that read each product's description; the category came from a regex
 * over its title. When the two disagree, the regex is the one that is wrong,
 * so a category that shares no interest with its shelf is cleared rather than
 * kept — "Everything else" is honest, a wrong shelf is not.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { CATEGORY_INTERESTS, deriveTags } from "../../lib/product-tags";

const APPLY = process.argv.includes("--apply");

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
  const rows = await prisma.gift.findMany({
    where: { category: { not: null } },
    select: { id: true, name: true, category: true, interests: true },
  });

  const updates: { id: string; from: string; to: string | null; name: string }[] = [];
  for (const r of rows) {
    const rederived = r.interests.includes("Sneakers")
      ? "Shoes"
      : (deriveTags({ title: r.name })?.category ?? null);

    const implied = rederived ? CATEGORY_INTERESTS[rederived] : null;
    const agrees = implied ? r.interests.some((i) => implied.includes(i)) : false;
    const next = agrees ? rederived : null;
    if (next !== r.category) updates.push({ id: r.id, from: r.category!, to: next, name: r.name });
  }

  const cleared = updates.filter((u) => u.to === null).length;
  console.log(`${updates.length} changes: ${cleared} cleared, ${updates.length - cleared} moved`);
  for (const u of updates.slice(0, 10)) console.log(`  ${u.from} -> ${u.to ?? "(none)"}   ${u.name.slice(0, 44)}`);
  if (!APPLY) { console.log("\npreview only; pass --apply to write."); await prisma.$disconnect(); return; }
  for (const u of updates) await prisma.gift.update({ where: { id: u.id }, data: { category: u.to } });
  console.log(`\nwrote ${updates.length}.`);
  await prisma.$disconnect();
}
main();
