import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Reads what people have sent through /feedback.
 *
 * A script rather than an admin page, and that is the decision rather than the
 * shortcut. An admin UI on a site with no accounts means inventing
 * authentication for one reader, and a login page is a bigger attack surface
 * than the thing it protects. The database is reachable from a terminal that
 * already holds the credential.
 *
 *   npx tsx scripts/read-feedback.ts               unhandled, newest first
 *   npx tsx scripts/read-feedback.ts --all         including handled
 *   npx tsx scripts/read-feedback.ts --handle <id> mark one as dealt with
 *   npx tsx scripts/read-feedback.ts --prune       drop spent throttle rows
 */

const ALL = process.argv.includes("--all");
const PRUNE = process.argv.includes("--prune");
const handleIndex = process.argv.indexOf("--handle");
const HANDLE = handleIndex === -1 ? null : process.argv[handleIndex + 1];

const prisma = new PrismaClient();

/** Throttle rows older than this can never affect a decision again. */
const THROTTLE_TTL_MS = 60 * 60 * 1000;

async function main() {
  if (HANDLE) {
    const updated = await prisma.suggestion.update({
      where: { id: HANDLE },
      data: { handled: true },
    });
    console.log(`Marked ${updated.id} handled.`);
    return;
  }

  if (PRUNE) {
    const { count } = await prisma.submissionThrottle.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - THROTTLE_TTL_MS) } },
    });
    console.log(`Pruned ${count} spent throttle row(s).`);
    return;
  }

  const suggestions = await prisma.suggestion.findMany({
    where: ALL ? {} : { handled: false },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const total = await prisma.suggestion.count();
  const open = await prisma.suggestion.count({ where: { handled: false } });
  console.log(`${total} suggestion(s) all told, ${open} not yet handled.\n`);

  if (suggestions.length === 0) {
    console.log(ALL ? "Nothing has been sent yet." : "Nothing outstanding.");
    return;
  }

  for (const s of suggestions) {
    const when = s.createdAt.toISOString().slice(0, 16).replace("T", " ");
    console.log(`${"-".repeat(72)}`);
    console.log(`${when}  ${s.kind}${s.handled ? "  [handled]" : ""}`);
    console.log(`id ${s.id}${s.path ? `  from ${s.path}` : ""}${s.email ? `  reply to ${s.email}` : "  (anonymous)"}`);
    console.log(`\n${s.message}\n`);
  }
  console.log("-".repeat(72));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
