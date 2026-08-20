/**
 * Removes listings written in a language the site does not serve.
 *
 * Safe to re-run: the importers now reject these on the way in, so a purged
 * row only returns if lib/language.ts stops recognising it.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { looksNonEnglish } from "../../lib/language";

const APPLY = process.argv.includes("--apply");

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
  const rows = await prisma.gift.findMany({ select: { id: true, name: true, platform: true } });
  const doomed = rows.filter((r) => looksNonEnglish(r.name));
  console.log(`${doomed.length} of ${rows.length} listings are not English`);
  for (const d of doomed.slice(0, 6)) console.log(`  ${d.platform.padEnd(7)} ${d.name.slice(0, 68)}`);
  if (!APPLY) { console.log("\npreview only; pass --apply to delete."); await prisma.$disconnect(); return; }
  const { count } = await prisma.gift.deleteMany({ where: { id: { in: doomed.map((d) => d.id) } } });
  console.log(`\ndeleted ${count}.`);
  await prisma.$disconnect();
}
main();
