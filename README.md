# GiftFinder

A gift quiz over a curated catalogue. Six questions about who you're shopping
for and the occasion, and you get a ranked, de-duplicated grid of real products
that link straight to the merchant.

Around 9,900 gifts across ~70 sources, covering 35 occasions from Christmas and
Birthdays through Diwali, Eid, Lunar New Year and Raksha Bandhan.

Built with Next.js (App Router), React 19, Tailwind CSS v4, and Prisma on Neon
Postgres. Live at https://thegiftfinder.net.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL
npm run db:migrate     # apply schema to your database
npm run dev
```

Open http://localhost:3000.

## Environment

Every variable is documented in [`.env.example`](.env.example). The only one
required to boot is `DATABASE_URL` (a pooled Neon connection string); the import
scripts each need their own key. `.env` is gitignored and should never be
committed.

There are no affiliate credentials. Every source is a plain developer API or a
public endpoint: Etsy and eBay issue free keys, Best Buy explicitly requires no
affiliate membership, and Shopify storefronts are public.

## Scripts

| Command                  | What it does                                          |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | Start the dev server                                  |
| `npm run build`          | Production build (needs a reachable `DATABASE_URL`)   |
| `npm start`              | Serve the production build                            |
| `npm run lint`           | Run ESLint                                            |
| `npm run db:migrate`     | Create/apply a Prisma migration                       |
| `npm run db:seed`        | Seed the database                                     |
| `npm run db:studio`      | Open Prisma Studio                                    |
| `npm run import:etsy`    | Import listings from the Etsy Open API v3             |
| `npm run import:ebay`    | Import listings from the eBay Browse API              |
| `npm run import:shopify` | Import from curated DTC brands' public `/products.json` |
| `npm run import:bestbuy` | Import from the Best Buy Products API                 |
| `npm run enrich:tags`    | Re-tag interests, age range and gender per product    |

Every script accepts `--dry-run`, which fetches and reports without writing.

## Project layout

```
app/
  api/recommend/     POST endpoint that ranks gifts from quiz answers
  page.tsx           Landing page; the quiz sits behind the CTA
  gifts/[occasion]/  Statically generated per-occasion pages
  privacy/           Privacy policy
  disclosure/        How this site works
components/          QuizLauncher, GiftQuiz, GiftResults, GiftCard, Header
lib/
  ranking.ts         Scores candidates, then re-ranks for variety
  gift-options.ts    The taxonomy: relationships, occasions, interests, budgets
  etsy.ts ebay.ts bestbuy.ts shopify.ts    Source API clients
prisma/              Schema, migrations, seed
scripts/             Catalogue importers and the tagging pass
```

## Deployment

Deployed on Vercel, but **not** from GitHub — there is no Git integration, and
CI only lints, typechecks and builds. Production ships when you run:

```bash
npx vercel --prod --yes
```

Set the same environment variables in the Vercel project settings, and point
`DATABASE_URL` at your Neon production branch. The build prerenders pages from
the database, so it needs a reachable one.

## How this site makes money

It doesn't. There are no affiliate links, no tracking parameters and no paid
placement; every product links directly to the merchant. See `/disclosure`.

Contributor notes, including the non-obvious traps, are in
[`AGENTS.md`](AGENTS.md).
