<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GiftFinder

A gift quiz over a curated catalogue. Six questions about the recipient produce
a ranked, de-duplicated grid of real products that link straight to the
merchant. Live at https://thegiftfinder.net.

## Deploying — pushing to GitHub does not deploy

There is no Git integration. `.github/workflows/ci.yml` lints, typechecks and
builds; it has **no deploy step**. Production ships only when someone runs:

```bash
npx vercel --prod --yes
```

If the live site is missing a change that is on `main`, this is why. Confirm a
deploy by fetching the page and grepping for the new copy, not by trusting the
push.

**CI needs a real database.** `next build` prerenders `/` and the 35
`/gifts/[occasion]` routes from Postgres, so a placeholder connection string
fails with `Error occurred prerendering page "/"` — a message naming neither
Postgres nor the credential. `DATABASE_URL` comes from a repository secret.

## Two traps that cost real time

**Never run `npm run build` while the dev server is running.** They share
`.next`, the build overwrites chunks the running server still holds open, and
the page renders completely unstyled with `Cannot find module './331.js'` in the
logs. It looks like a catastrophic CSS bug and is neither. Stop the preview
server, `rm -rf .next`, restart.

**`tsx` does not read `.env`.** Every script under `scripts/` must
`import "dotenv/config"` as its first import or its credentials are silently
`undefined`. Same pattern as `prisma.config.ts`.

## Deliberate architectural decisions

Each of these was chosen and is easy to undo by accident.

**No affiliate layer.** The site earns nothing and links straight to merchants.
`lib/affiliate.ts` was deleted along with all five `NEXT_PUBLIC_` tracking
variables. Do not reintroduce tracking parameters, and note that the copy
("nothing sponsored, nothing paid to rank", "we earn nothing from your
purchase") is only true while this holds. `Gift.productUrl` is
`@map("affiliateUrl")` — the column keeps the old name so the rename needed no
migration.

**No LLM at request time.** `/api/recommend` and `/api/similar` are both a
Postgres query plus pure scoring, and run in ~100–300 ms at zero marginal cost.
The only Claude usage is `scripts/enrich-tags.ts`, an offline Batch API pass.
Adding a model call to either request path would break both the latency and the
"about 30 seconds" promise.

**The gift detail view is an overlay, not a route.** Tapping a card opens
`components/GiftDetail.tsx` in place. There is no `/gift/[id]`, and adding one
would be a regression rather than an improvement: results live only in the
tab's memory, computed from quiz answers that are never written to the URL, so
navigating away and back would either lose the grid or have to re-run the whole
quiz to rebuild it. The same reason the quiz reveals in place instead of
routing to `/quiz`.

**`/api/similar` demotes what is already on the page; it must not exclude it.**
Ranking anchors on the product the shopper tapped, and anything already in
their results is pushed below every genuine discovery by `SEEN_DEMOTION`.
Filtering those rows out instead looks tidier and is wrong: on a narrow query
the grid already holds every eligible candidate, and the panel came back empty
on the one product they pointed at.

**`findMany` in the recommend route has an explicit `select`.** Without it
Prisma fetches every column for thousands of candidate rows, and `description`
alone — read by nothing — was about half the bytes. Removing the `select`
silently doubles the payload and the latency.

**Occasions are curated; interests, age and gender are per-product.** An
occasion says *why* someone is shopping, so it belongs to the import query.
Interests, age range and gender describe the product, so they come from the
tagging pass. Every value must already exist in `lib/gift-options.ts`; the
importers assert this and throw on an unknown one.

**`unisex` is the reach lever.** `/api/recommend` filters
`gender: { in: [selected, "unisex"] }`, so unisex products appear in *every*
search and gendered ones in half. Watch the unisex share when re-tagging — it
was 87% before the first pass and 61% after, and pushing it much lower shrinks
the effective catalogue for everyone.

## Catalogue

Roughly 9,900 gifts across ~70 sources. Every source is a plain developer API or
public endpoint — no affiliate membership anywhere.

| Script | Source | Credential |
| --- | --- | --- |
| `npm run import:etsy` | Etsy Open API v3 | free key; `x-api-key` is `keystring:shared_secret` |
| `npm run import:ebay` | eBay Browse API | free keyset; OAuth client-credentials token |
| `npm run import:shopify` | ~70 DTC brands' public `/products.json` | none |
| `npm run import:bestbuy` | Best Buy Products API | free key, **needs a business-domain email** |
| `npm run enrich:tags` | Claude Batch API | `ANTHROPIC_API_KEY` |

Every script takes `--dry-run`. Verify a Shopify domain serves `/products.json`
before adding it to `BRANDS` — about half of tested brands block it, and some
return the wrong image entirely. **Also check the store's currency**: the feed
carries no currency field and the importer hardcodes USD, so a CAD or EUR
storefront silently imports mispriced. The storefront HTML carries
`"active":"XXX"`; `deadstock.ca`, `capsuletoronto.com` and `fermliving.com` were
dropped on exactly this.

`Brand.prefer` fills a brand's 60 slots with matching products first, tested
against `product_type` and title. Sneaker boutique feeds are roughly
three-quarters apparel, so without it the shoes lose their slots to whatever
t-shirt dropped that week — footwear share of what imports was 25% before and
93% after.

### Sources that were tried and cannot be used

Checked 2026-08-19; do not spend the afternoon on them again.

| Source | Why not |
| --- | --- |
| **IKEA** | No `/products.json`, no public product API, and `robots.txt` disallows every `*/search/*` path an importer would need. The only way in is its undocumented internal endpoint, against that stated policy. Covered instead by Umbra, Floyd, Bend Goods, Brightech and the LED brands. |
| **StockX** | `robots.txt` disallows `/api/` and `*/search*` for every user agent. Its sanctioned API is a partner programme behind a business agreement. |
| **GOAT** | Returns a Cloudflare managed challenge for `robots.txt` itself. Getting a crawler past it means defeating bot detection. |

Hyped sneakers are covered instead by the 18 boutiques that hold real Nike
SNKRS allocations, plus eBay's Authenticity Guarantee queries for pairs that
only exist on the resale market.

`enrich:tags` overwrites interests, age range and gender on every row. Snapshot
first; `tag-backup-*.json` at the repo root is gitignored and is the only way
back short of re-running every import.

**The importers must never write those three fields on update.** They are set on
create, from brand-level defaults, and from then on `enrich:tags` owns them.
`import-shopify.ts` did carry them in its `update` until 2026-08-19, so
re-running it reverted every enriched row to its brand default — 4,050 rows
across 71 brands, discarding a paid Batch API run and printing nothing. Prices,
titles, images and occasions are still refreshed on update; `--retag` restores
the old behaviour deliberately, for when a brand's entry was wrong.

## Design system

"Champagne on Ivory", **light mode only**. Warm ivory `#faf7f0`, near-black
`#1b1c24` with an indigo bias, one accent: antique gold `#8c6829`, taken deep
enough to clear 4.5:1 both as text on ivory and behind ivory text. Do not
lighten it. Fraunces for headlines, wordmark and prices; Inter for body; an
uppercase 11–12px tracked eyebrow style recurs throughout.

The wordmark's "i" in *Finder* is a **dotless ı (U+0131)** with a magnifying
glass positioned as its tittle. Restoring a normal "i" puts a real dot inside
the glass. The span is `aria-hidden`; the link's `aria-label` carries the name.

**No em-dashes in visitor-facing copy.** They read as machine-written. Code
comments are fine.
