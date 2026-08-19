/**
 * One-off correction for rows imported before the bag/compound-apparel gaps in
 * lib/product-tags.ts were closed.
 *
 * Safe by construction: it only considers rows carrying "Sneakers", an
 * interest that did not exist when `enrich:tags` last ran, so no Claude-tagged
 * row can be in scope. It only writes when the title alone now derives a
 * clearly non-footwear category.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { deriveTags } from "../../lib/product-tags";

const APPLY = process.argv.includes("--apply");

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
  const rows = await prisma.gift.findMany({
    where: { interests: { has: "Sneakers" } },
    select: { id: true, name: true, platform: true, interests: true, price: true },
  });

  const fixes: { id: string; name: string; platform: string; price: number; from: string[]; to: string[]; label: string }[] = [];
  for (const r of rows) {
    const d = deriveTags({ title: r.name });
    if (!d || d.interests.length === 0) continue;
    // Sneaker colourways are adversarial to keyword rules: "BLACK COFFEE",
    // "Cow Print", "Mustard Seed", "Nike Book 2", "Yoga Vario" are all shoes.
    // At import time the rules also read product_type, which resolves them to
    // footwear; here only the title survives, so anything that could be a shoe
    // is left alone. Only two labels are trusted, and only when nothing in the
    // title suggests footwear.
    if (!["bags & luggage", "apparel", "headwear", "rugs, throws & textiles", "jewellery"].includes(d.label)) continue;
    if (/\bshoes?\b(?! palace| compartment| bags?\b| pockets?| organiz)/i.test(r.name)) continue;
    // Only the nouns that can only be a shoe — model names are exactly what
    // gets printed on the jerseys, so they must not veto a correction here.
    // "Shoe Palace" is a retailer, not a shoe. Without the lookahead their
    // name satisfies the veto and none of their apparel is ever corrected.
    if (/sneaker|\bmule\b|\bclog\b|\bslides?\b|trainer|\bsandal|\bloafer|\bmocs?\b|\bcleat|\bboots?\b/i.test(r.name)) continue;
    // Sneaker nicknames that collide with apparel nouns. "The Glove" is Gary
    // Payton's Nike Air Zoom Flight, not a glove.
    if (/the glove|zoom flight|\bwindrunner\b|\bblazers?\b/i.test(r.name)) continue;
    if ([...d.interests].sort().join() === [...r.interests].sort().join()) continue;
    fixes.push({ id: r.id, name: r.name, platform: r.platform, price: Number(r.price), from: r.interests, to: d.interests, label: d.label });
  }

  const byLabel: Record<string, number> = {};
  for (const f of fixes) byLabel[f.label] = (byLabel[f.label] ?? 0) + 1;
  console.log(`${rows.length} rows carry "Sneakers"; ${fixes.length} are mis-tagged.`);
  for (const [l, n] of Object.entries(byLabel).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} × ${l}`);
  console.log("\nsample:");
  for (const f of fixes.sort((a, b) => b.price - a.price).slice(0, 8))
    console.log(`  $${f.price.toFixed(0).padStart(5)} ${f.platform.padEnd(18)} ${f.name.slice(0, 40).padEnd(42)} [${f.from}] → [${f.to}]`);

  if (!APPLY) { console.log("\npreview only; pass --apply to write."); await prisma.$disconnect(); return; }
  for (const f of fixes) await prisma.gift.update({ where: { id: f.id }, data: { interests: f.to } });
  console.log(`\nupdated ${fixes.length} rows.`);
  await prisma.$disconnect();
}
main();
