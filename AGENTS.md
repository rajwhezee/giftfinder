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

**No LLM at request time.** `/api/recommend` is a Postgres query plus pure
scoring, and runs in ~100–300 ms at zero marginal cost. The only Claude usage is
`scripts/enrich-tags.ts`, an offline Batch API pass. Adding a model call to the
request path would break both the latency and the "about 30 seconds" promise.

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
return the wrong image entirely.

`enrich:tags` overwrites interests, age range and gender on every row. Snapshot
first; `tag-backup-*.json` at the repo root is gitignored and is the only way
back short of re-running every import.

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
