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

**CI needs a real database.** `next build` prerenders `/` and the 36
`/gifts/[occasion]` routes from Postgres, so a placeholder connection string
fails with `Error occurred prerendering page "/"` — a message naming neither
Postgres nor the credential. `DATABASE_URL` comes from a repository secret.

## Traps that cost real time

**`tsx` does not read `.env`.** Every script under `scripts/` must
`import "dotenv/config"` as its first import or its credentials are silently
`undefined`. Same pattern as `prisma.config.ts`.

**Concurrent `dev` and `build` used to corrupt each other. It no longer does.**
On Next 15 they shared `.next`, the build overwrote chunks the running dev
server still held open, and the page rendered completely unstyled with
`Cannot find module './331.js'` in the logs. Next 16 gives `next dev` its own
`.next/dev` directory, so the two can run together; verified on this project by
building, then starting dev, and confirming `.next/BUILD_ID` survived. Take the
warning off the list rather than working around a problem that is gone.

**Development needs `'unsafe-eval'` in the CSP; production must not have it.**
React's dev build evaluates strings to rebuild callstacks across the
server/client boundary, and Next 16's overlay leans on it harder than 15 did.
`next.config.ts` adds `'unsafe-eval'` to `script-src` only when
`NODE_ENV === "development"`. Without it the console fills with `EvalError` and
the page can stop responding to input, which reads as a hang in the quiz rather
than as a policy problem. Do not "simplify" this by adding it unconditionally.

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
Postgres query plus pure scoring, at zero marginal cost. Measured on production
2026-08-19 at ~18,900 gifts: a one-interest search ~300–360 ms, two interests
~280 ms, and a five-interest search with no budget limits ~790 ms.
Re-measured 2026-09-01 at ~20,700 gifts, over the public URL so these include
the round trip: one-interest ~460 ms, five-interest ~880 ms. Higher than the
figures above because the catalogue grew, not because the quality cut costs
anything — it shrinks the pool the diversity pass walks.
The only Claude usage is `scripts/enrich-tags.ts` and `scripts/score-gifts.ts`,
both offline Batch API passes. Adding a model call to either request path would
break both the latency and the "about 30 seconds" promise.

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

**The recommend route is shaped around not touching rows it will discard.**
Three separate guards, each of which was added after the latency regressed:

- The `findMany` has an explicit `select`, and it lists only what *scoring*
  reads. `description` was dropped for being half the bytes; `imageUrl`,
  `productUrl` and `currency` followed, because no scoring step reads them —
  they come from a second query keyed on the 150 ids that survive. Putting them
  back in the first query means fetching URLs for every candidate to render 150.
- Interest overlap is a SQL `hasSome`, not a JS filter. `MIN_INTEREST_MATCHES`
  means a gift sharing no interest can never be returned, so filtering after the
  fetch pulled 14,468 rows to keep 3,900.
- `DIVERSITY_POOL` caps what `selectDiverse` walks at 4× the result cap. That
  pass is greedy and compares title tokens on every rescan, so it is the CPU
  bound rather than the database: 11,000 candidates ran 610 ms on a laptop and
  1.4 s on the function, on identical data.

`candidateCount` is only queried when there are no results, which is the only
time the UI renders it.

**How long a results page is, is decided by fit, not by a slot count.**
`QUALITY_RATIO` keeps everything scoring within 12% of the strongest match and
drops the rest; `MAX_RESULTS` is only a ceiling, and `MIN_RESULTS` only a floor.
Measured on 2026-09-01, six representative quizzes returned 119, 59, 114, 43,
150 and 42 gifts where every one of them used to return 150. That is the point:
a fixed count guarantees the tail gets filled whether or not anything down there
deserved a slot, and it made the number on the page read as a quota.

The cut runs **before** the diversity pass, not after. Diversity discounts a
candidate for repeating what is already picked, so filtering on the raw score
afterwards mixes two different judgments and returns a page that is neither the
best matches nor a full one: the same six quizzes gave 53, 31, 77, 43, 86 and 24
that way, the last of them hitting the floor.

The results headline prints that total, and it is only honest to do so while
the length is decided this way. It was removed for a day when the route still
returned a fixed 150 and every shopper met the same figure whoever they had
described. Put a fixed slot count back and the headline has to come out again.

**A card shows the maker; its button shows the marketplace.** `Gift.platform`
is the brand for the ~140 Shopify storefronts and the marketplace name for the
rest, so before `Gift.brand` existed every eBay row said "eBay" above its title
and the brand filter offered one chip reading "eBay 6230", which is the choice
between everything and the same everything. `brandLabel()` in
`lib/brand-from-title.ts` is what the eyebrow and the filter use; the "View on
eBay" button deliberately still uses `platform`, because that is where the link
goes and "View on Coach" opening eBay would be a lie.

`brand` is derived from the listing title by a vocabulary, not by the API.
eBay's `item_summary/search` carries no brand field at any `fieldgroups` value,
and `/item/{id}`, which does, answers 403 to a free client-credentials keyset;
both checked 2026-09-02. Pulling it from the listing description was measured
and rejected: over 900 live listings it added 0.9 points of coverage and was
wrong when it fired, labelling a Bonavita kettle "Chemex" and a third-party
controller "Nintendo", because descriptions name compatible and comparable
products. The vocabulary covers 69.6% of eBay rows; the rest are genuinely
unbranded white-label goods where "eBay" is the honest answer. Extending the
list in `lib/brand-from-title.ts` and re-running
`npx tsx scripts/backfill-brands.ts` is how that number goes up.

Etsy rows keep saying Etsy. They are independent sellers with no brand, and
`/listings/active` silently ignores `includes=Shop` the same way it ignores
`includes=Images`, so a shop name would cost a call per shop and still only be
a seller handle.

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

Roughly 20,700 gifts across ~70 sources, counted 2026-08-21. Every source is a
plain developer API or public endpoint — no affiliate membership anywhere.

| Script | Source | Credential |
| --- | --- | --- |
| `npm run import:etsy` | Etsy Open API v3 | free key; `x-api-key` is `keystring:shared_secret` |
| `npm run import:ebay` | eBay Browse API | free keyset; OAuth client-credentials token |
| `npm run import:shopify` | ~70 DTC brands' public `/products.json` | none |
| `npm run import:bestbuy` | Best Buy Products API | free key, **needs a business-domain email** |
| `npm run enrich:tags` | Claude Batch API | `ANTHROPIC_API_KEY` |
| `npm run score:gifts` | Claude Batch API | `ANTHROPIC_API_KEY` |

**An import is not finished until it is scored.** New rows arrive with
`giftScore` null, and the occasion pages ask for `giftScore >= 55` in one tier
and `{ not: null, lt: 55 }` in the other, so an unscored row matches neither and
appears on no landing page at all. Run `npm run score:gifts -- --only-missing`
after every import.

The failure is silent in the worst way. The products are in the database, the
quiz finds them — `scoreGift` treats a null score as neutral rather than
penalising it — so the only broken surface is the 36 pages nobody checks
immediately. 2,064 Etsy toys imported on 2026-08-21 were reachable through the
quiz within minutes and invisible on `/gifts/birthday` until they were scored;
what looked like a deploy that had not shipped was a pipeline step that had not
run.

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
Two importers have carried them in `update` and had to be fixed:
`import-shopify.ts` until 2026-08-19, where re-running it reverted every
enriched row to its brand default — 4,050 rows across 71 brands, discarding a
paid Batch API run and printing nothing — and `import-etsy.ts` until
2026-08-21, which had the same shape over 4,037 rows and was caught before it
ran rather than after. Check this in any new importer before running it once;
it is invisible afterwards. Prices, titles, images and occasions are still
refreshed on update; `--retag` restores the old behaviour deliberately, for
when a query or brand entry was wrong.

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
