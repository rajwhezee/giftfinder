import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Flags rows whose product photo the merchant's CDN no longer serves.
 *
 * Every image on the site is hotlinked from Shopify, Etsy or eBay, so the
 * photos rot on the merchant's schedule rather than ours. The first full sweep,
 * 2026-09-07, found 75 dead out of 29,135. Re-importing the twelve affected
 * storefronts recovered 49; the remaining 26 are products still listed in the
 * merchant's own feed pointing at an image their own CDN 404s, which no import
 * can recover.
 *
 * `Gift.imageOk` is what ranking reads. components/GiftImage.tsx still draws a
 * placeholder if one slips through, because a sweep is a snapshot and a URL can
 * die an hour after it is checked — the flag keeps them off the page, the
 * component keeps the page from breaking when the flag is stale.
 *
 *   npx tsx scripts/check-images.ts              sweep everything
 *   npx tsx scripts/check-images.ts --dry-run    report, write nothing
 *   npx tsx scripts/check-images.ts --recheck    re-test rows already flagged
 *
 * Without --recheck, rows already marked broken are skipped, so a routine sweep
 * only pays for the photos believed to be good. Run it with --recheck after an
 * import that refreshed image URLs, or the recovered rows stay hidden.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const RECHECK = process.argv.includes("--recheck");
const CONCURRENCY = 60;
const TIMEOUT_MS = 15_000;

const prisma = new PrismaClient();

/**
 * A ranged GET rather than HEAD: several of these CDNs answer HEAD with 405
 * while serving the image perfectly well, which would condemn a live photo.
 * The range keeps it to one byte.
 */
async function probe(url: string): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        headers: {
          Range: "bytes=0-0",
          "User-Agent": "Mozilla/5.0 (compatible; giftfinder-imagecheck/1.0)",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      try {
        await res.arrayBuffer();
      } catch {
        // Body we asked for and do not want; a failure to drain is not a verdict.
      }
      return res.status;
    } catch {
      // One retry: a timeout or a reset is the network's opinion, not the CDN's.
    }
  }
  return null;
}

async function main() {
  const rows = await prisma.gift.findMany({
    where: RECHECK ? {} : { imageOk: true },
    select: { id: true, name: true, platform: true, imageUrl: true, imageOk: true },
  });

  console.log(
    `Checking ${rows.length} image(s)${RECHECK ? " (including rows already flagged)" : ""}` +
      `${DRY_RUN ? " — dry run" : ""}\n`,
  );

  const broken: typeof rows = [];
  const recovered: typeof rows = [];
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const status = await probe(row.imageUrl);
      const ok = status !== null && status >= 200 && status < 300;

      // A network failure is not evidence the photo is gone. Only an answer
      // from the CDN condemns a row, or the flag would swing on our own wifi.
      if (!ok && status !== null) broken.push(row);
      if (ok && !row.imageOk) recovered.push(row);

      if (++done % 2500 === 0) console.log(`  ${done}/${rows.length} checked`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const byPlatform = new Map<string, number>();
  for (const row of broken) byPlatform.set(row.platform, (byPlatform.get(row.platform) ?? 0) + 1);

  console.log(`\n${broken.length} dead, ${recovered.length} recovered.`);
  if (byPlatform.size) {
    console.log("\nDead by platform:");
    for (const [platform, count] of [...byPlatform].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)} × ${platform}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    if (broken.length) {
      console.log("Sample:");
      for (const row of broken.slice(0, 8)) console.log(`  ${row.platform} — ${row.name.slice(0, 60)}`);
    }
    return;
  }

  if (broken.length) {
    await prisma.gift.updateMany({ where: { id: { in: broken.map((r) => r.id) } }, data: { imageOk: false } });
  }
  if (recovered.length) {
    await prisma.gift.updateMany({ where: { id: { in: recovered.map((r) => r.id) } }, data: { imageOk: true } });
  }

  const stillBroken = await prisma.gift.count({ where: { imageOk: false } });
  console.log(`\nWrote ${broken.length + recovered.length} change(s). ${stillBroken} row(s) now hidden from ranking.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
