/** One-off: 32 rows accumulated a repeated interest tag. */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
  const rows = await prisma.gift.findMany({ select: { id: true, interests: true } });
  let fixed = 0;
  for (const r of rows) {
    const unique = [...new Set(r.interests)];
    if (unique.length === r.interests.length) continue;
    await prisma.gift.update({ where: { id: r.id }, data: { interests: unique } });
    fixed++;
  }
  console.log(`deduplicated ${fixed} rows.`);
  await prisma.$disconnect();
}
main();
