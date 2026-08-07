# GiftFinder

A one-stop gift finder — a short quiz about who you're shopping for and the
occasion, and you get a ranked list of gift ideas with affiliate links across
Amazon, eBay, Etsy and Walmart.

Built with Next.js (App Router), React 19, Tailwind CSS v4, and Prisma on Neon
Postgres.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL and any affiliate IDs
npm run db:migrate     # apply schema to your database
npm run db:seed        # optional: load starter catalog
npm run dev
```

Open http://localhost:3000.

## Environment

Every variable is documented in [`.env.example`](.env.example). The only one
required to boot is `DATABASE_URL` (a pooled Neon connection string). Affiliate
IDs fall back to safe placeholders, so the app runs before you have affiliate
accounts. `.env` is gitignored and should never be committed.

## Scripts

| Command              | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Start the dev server                             |
| `npm run build`      | Production build                                 |
| `npm start`          | Serve the production build                       |
| `npm run lint`       | Run ESLint                                       |
| `npm run db:migrate` | Create/apply a Prisma migration                  |
| `npm run db:seed`    | Seed the database                                |
| `npm run db:studio`  | Open Prisma Studio                               |
| `npm run db:import`  | Import the CSV catalog in `data/gifts.csv`       |
| `npm run import:etsy`| Import listings from the Etsy Open API v3        |

## Project layout

```
app/
  api/recommend/   POST endpoint that ranks gifts from quiz answers
  page.tsx         Quiz + results
  privacy/         Privacy policy
  disclosure/      Affiliate disclosure
components/        GiftQuiz, GiftResults, GiftCard, Header
lib/
  ranking.ts       Scores and orders gift candidates
  affiliate.ts     Builds affiliate links per merchant network
  etsy.ts          Etsy Open API v3 client
  occasion-search.ts, gift-options.ts, types.ts
prisma/            Schema, migrations, seed
scripts/           Catalog importers
```

## Deployment

Deployed on Vercel. Set the same environment variables in the Vercel project
settings, and point `DATABASE_URL` at your Neon production branch.

## Affiliate disclosure

This site earns commissions from qualifying purchases made through its links.
See `/disclosure`.
