import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { INTERESTS, OCCASIONS } from "../lib/gift-options";

const CSV_PATH = path.join(process.cwd(), "data", "gifts.csv");

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface RawRow {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  productUrl: string;
  platform: string;
  occasions: string;
  interests: string;
  ageMin: string;
  ageMax: string;
}

const REQUIRED_FIELDS: (keyof RawRow)[] = [
  "name",
  "description",
  "price",
  "imageUrl",
  "productUrl",
  "platform",
  "occasions",
  "interests",
  "ageMin",
  "ageMax",
];

interface ValidatedGift {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  affiliateUrl: string;
  platform: string;
  occasions: string[];
  interests: string[];
  ageMin: number;
  ageMax: number;
}

function buildCanonicalLookup(values: readonly string[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const value of values) {
    lookup.set(value.toLowerCase(), value);
  }
  return lookup;
}

const OCCASION_LOOKUP = buildCanonicalLookup(OCCASIONS);
const INTEREST_LOOKUP = buildCanonicalLookup(INTERESTS);

function warn(rowNumber: number, message: string): void {
  console.warn(`Row ${rowNumber}: ${message} — skipping.`);
}

/**
 * Splits a pipe-separated field (e.g. "birthday|christmas"), trims each
 * token, and maps it case-insensitively onto the canonical value from
 * lib/gift-options.ts (so "birthday" is stored as "Birthday"). Returns null
 * if the field is empty or contains any value not found in `lookup`.
 */
function splitAndNormalize(
  raw: string,
  lookup: Map<string, string>,
  fieldName: string,
  rowNumber: number,
): string[] | null {
  const tokens = raw
    .split("|")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    warn(rowNumber, `${fieldName} has no values`);
    return null;
  }

  const normalized: string[] = [];
  for (const token of tokens) {
    const canonical = lookup.get(token.toLowerCase());
    if (!canonical) {
      warn(rowNumber, `${fieldName} value "${token}" is not defined in lib/gift-options.ts`);
      return null;
    }
    normalized.push(canonical);
  }

  return normalized;
}

function validateRow(row: RawRow, rowNumber: number): ValidatedGift | null {
  for (const field of REQUIRED_FIELDS) {
    if (!row[field] || row[field].trim().length === 0) {
      warn(rowNumber, `missing required field "${field}"`);
      return null;
    }
  }

  const price = Number(row.price);
  if (!Number.isFinite(price) || price <= 0) {
    warn(rowNumber, `price "${row.price}" is not a positive number`);
    return null;
  }

  const ageMin = Number(row.ageMin);
  const ageMax = Number(row.ageMax);
  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax)) {
    warn(rowNumber, `ageMin/ageMax must be whole numbers (got "${row.ageMin}", "${row.ageMax}")`);
    return null;
  }
  if (ageMin > ageMax) {
    warn(rowNumber, `ageMin (${ageMin}) is greater than ageMax (${ageMax})`);
    return null;
  }

  const occasions = splitAndNormalize(row.occasions, OCCASION_LOOKUP, "occasions", rowNumber);
  if (!occasions) return null;

  const interests = splitAndNormalize(row.interests, INTEREST_LOOKUP, "interests", rowNumber);
  if (!interests) return null;

  return {
    name: row.name.trim(),
    description: row.description.trim(),
    price,
    imageUrl: row.imageUrl.trim(),
    affiliateUrl: row.productUrl.trim(),
    platform: row.platform.trim(),
    occasions,
    interests,
    ageMin,
    ageMax,
  };
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`No CSV found at ${CSV_PATH}`);
    process.exitCode = 1;
    return;
  }

  const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
  const rows: RawRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let upserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    // +1 to move from 0-index to 1-index, +1 more because row 1 is the header.
    const rowNumber = i + 2;
    const gift = validateRow(rows[i], rowNumber);
    if (!gift) {
      skipped++;
      continue;
    }

    await prisma.gift.upsert({
      where: { affiliateUrl: gift.affiliateUrl },
      update: gift,
      create: gift,
    });
    upserted++;
  }

  console.log(`Done. Upserted ${upserted} gift(s), skipped ${skipped} invalid row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
