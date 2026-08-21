---
name: image-to-code
description: Visual-first design-to-code workflow for GiftFinder's frontend. Use when the task is mainly about how a page looks - a new section, a hero, a landing or occasion page, a redesign, "make this more premium", "this feels cluttered", or any request described in visual terms rather than functional ones. Scopes the change against the graphify graph, builds a rendered reference first, analyses it, implements against it in the Champagne on Ivory system, then screenshots the running dev server to verify the result matches. Do not use for bug fixes, API or scoring work, importer changes, or tasks with no visible surface.
---

# Visual-first design to code

You are an art director and implementation strategist working on one specific
site. Your job is not to invent a new visual language per request. It is to
extend an existing one faithfully, and to prove the result matches before you
call it done.

The order is: **reference first, deep analysis second, implementation third,
verification fourth.** Do not begin visual work by typing JSX.

---

## 1. What "reference first" means in Claude Code

Claude Code has no image generation. The original form of this skill assumed a
model that could render a design board on demand; that step does not exist
here, and pretending it does produces hand-waving instead of a reference.

Substitute a **rendered** reference. You have three sources. Use the highest one
that applies:

**1. A reference the user supplied.** A screenshot, a mockup, an exported frame,
a link to a site they like. Read image files directly with the Read tool - it
renders them visually. This is the strongest source because it is what they
actually want. Analyse it per section 5 before touching code.

**2. An artboard you build and screenshot.** This is the real substitute for
image generation, and it is better than what it replaces: the reference is
already code. Write a standalone HTML file per section into the scratchpad,
inline the palette tokens from section 4, open it in the Browser pane, and
screenshot it at a real viewport. You can then iterate on the artboard cheaply -
no database, no build, no app state - until the composition is right, and only
then port it into the app. For a multi-artboard canvas the user can push back
on directly, use the `design` skill instead of hand-rolling this.

**3. The live page as it stands.** For a redesign, screenshot the current page
first. That is the baseline you are moving away from, and it is the only honest
way to show a before and after.

If none of the three is available and the change is genuinely small - a spacing
correction, a colour fix, one line of copy - skip the reference and go straight
to code. Do not perform a ceremonial artboard for a two-line change. The point
of the reference is to prevent freeform drift on work with real visual surface,
not to add a step to everything.

**Never invent the reference in prose.** "I imagined a clean editorial hero" is
not a reference. If you cannot render it, you do not have one.

---

## 2. Scope with the graph before reading files

`graphify-out/` holds a knowledge graph of this repo. Query it before opening
files, and know precisely what it does and does not cover, because the split
matters for visual work.

**It is gitignored, so it may not exist.** The graph is a derived artifact and
does not travel with a clone. If `graphify-out/graph.json` is absent, this
section is optional, not blocked: either rebuild it once with `graphify .`, or
skip to section 3 and find files by reading them. Never stall on a missing
graph, and never describe a blast radius you did not actually query.

**It does not index CSS.** `app/globals.css` contributes zero nodes; extraction
is AST-based over TS, TSX and config. The entire design system - every token,
`.chip`, `.card-surface`, `.btn-primary` - is invisible to it. So the graph
cannot answer "what does this look like", and section 4 still means reading
`globals.css` directly. Do not substitute a query for that.

**What it does answer is the blast radius.** Before a visual change, one query
returns every file, symbol, line number and community the change will touch,
without reading anything:

```bash
graphify query "which components render the results grid" --budget 1500
```

Use it to scope, then read only what it named. Raise `--budget` when the result
truncates, or narrow the question rather than reading everything it returned.

**The decisions in section 12 are graph communities.** `No LLM Runtime`,
`Gift Detail Overlay`, `Similar API Demotion`, `No Affiliate Layer`,
`Unisex Reach Strategy`, `Diversity Pool Cap`. If a query for your change
surfaces one of those communities, the constraint it names is live for the work
you are about to do, and section 12 applies. That is the cheapest available
check against redesigning something into a shape the architecture has already
ruled out.

```bash
graphify explain "Gift Detail Overlay"
```

**Check freshness first.** The graph records the commit it was built from:

```bash
python3 -c "import json;print(json.load(open('graphify-out/graph.json'))['built_at_commit'])"
```

Compare against `git rev-parse HEAD`. If they differ, the graph predates your
working tree and may point at code that moved. `graphify update .` re-extracts
only what changed and costs no API tokens.

---

## 3. The verification loop

This is the part the original skill could not do, and it matters more than
everything before it. Never ask the user to check whether it looks right.
Look yourself.

After implementing:

```bash
npm run dev
```

Start it through the Browser pane, not Bash - `preview_start` with
`{name: "giftfinder-dev"}` (port 3000, already in `.claude/launch.json`).
Next 16 gives dev its own `.next/dev`, so a concurrent build is no longer a
hazard.

Then:

1. `computer {action: "screenshot"}` at desktop, and compare it against the
   reference, element by element, using section 5's checklist in reverse.
2. `resize_window` to `mobile` (375x812) and reload, since load-time device
   gates re-run. The quiz is used on phones more than laptops.
3. `read_console_messages` for errors. In dev the CSP allows `'unsafe-eval'`
   deliberately; a wall of `EvalError` means that config broke, not that your
   component did.
4. `javascript_tool` to read computed values when something looks off by a few
   pixels - `getComputedStyle` beats squinting at a screenshot.
5. Share the screenshot as proof. A visual claim without an image is an
   unverified claim.

If the implementation drifted from the reference, fix the implementation. Do not
retroactively decide the reference was wrong because the code was easier the
other way. That is the failure this whole skill exists to prevent.

---

## 4. The design system is fixed

**Champagne on Ivory. Light mode only.** This is not one option among several.
There is no theme choice, no palette exploration, no dark variant. The original
skill asked the model to pick a theme paradigm, a background character, a
typography character and four signature components per task. Delete that
instinct here: the choices are already made, they are documented in
`AGENTS.md`, and re-making them per request is how a coherent site turns into
six unrelated pages.

### Tokens - use the variable, never the hex

Defined in `app/globals.css`, exposed to Tailwind via `@theme inline`.

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#faf7f0` | warm ivory page ground, tinted and grained, never plain white |
| `--surface` | `#ffffff` | cards and raised panels |
| `--ink` | `#1b1c24` | near-black with an indigo bias |
| `--ink-soft` | `#575866` | secondary text |
| `--ink-faint` | `#8a8b96` | eyebrows, metadata |
| `--rule` | `rgba(27,28,36,0.13)` | hairline borders |
| `--terracotta` | `#8c6829` | the accent. Antique gold. Reads as "the accent" - the name is historical |
| `--terracotta-deep` | `#6f511e` | accent hover |
| `--on-accent` | `#fffbf2` | ivory text on a gold fill |
| `--plum` | `#4a5480` | rare secondary |
| `--shadow-soft` / `--shadow-lift` | | resting and hover elevation |

**Do not lighten the gold.** `#8c6829` is taken deep enough to clear 4.5:1 both
as text on ivory and as a fill behind ivory text. A lighter, prettier gold
fails contrast in both directions at once, and nothing here relies on large
type to stay legible.

### Type

- **Fraunces** (`.font-display`, `--font-display`) - headlines, the wordmark,
  prices. Optical sizing on, `-0.015em` tracking. The SOFT and WONK axes are
  enabled, so the glyphs differ from a stock Google Fonts copy.
- **Inter** (`--font-sans`) - body, UI, everything else.
- **The eyebrow**: `text-xs tracking-[0.2em] text-ink-faint uppercase`, or
  `text-[11px] tracking-[0.14em]` at card scale. It recurs across the header,
  cards, the detail overlay, the 404 and the occasion pages.
- `.accent-word` - one italic gold word inside a headline. The single place
  colour carries emphasis. Use at most once per view.

### Existing components to reuse before inventing

`.card-surface`, `.card-hover`, `.card-hover-lift`, `.chip` (with
`data-selected`), `.btn-primary`, `.btn-launch`, `.rule-hairline`,
`.paper-grain`, `.skip-link`. Read `app/globals.css` before writing a new class.
Most "new" component needs are already there under a name you did not guess.

### Two things that break if you touch them

- **The wordmark's "i" in *Finder* is a dotless ı (U+0131)** with a magnifying
  glass as its tittle. A normal "i" puts a real dot inside the lens. The span is
  `aria-hidden`; the link's `aria-label` carries the name.
- **`.btn-launch`'s pulse** is the landing page's one motion cue, neutralised
  under `prefers-reduced-motion`. Every motion you add needs the same
  treatment - there is a `@media (prefers-reduced-motion: reduce)` block at the
  bottom of `globals.css`.

---

## 5. Deep analysis

Treat the reference as a specification, not a mood. Before implementing,
extract and write down:

**Text.** Headline wording, subheadline, CTA labels, section headings, nav and
footer labels. Visible copy is part of the design and should survive into the
implementation.

**Typography.** Size relationships, weight relationships, line count, line
height feel, tracking, display-versus-body contrast, whether the type is calm
or aggressive. Do not flatten a considered hierarchy into generic `text-2xl`.

**Spacing.** Headline to subheadline, text to button, card to card, section top
and bottom, side gutters, card padding, image to text. Not pixel OCR - faithful
spacing *logic*. If the reference is generous, do not implement it tight.

**Components.** Button size, shape, radius, fill versus outline, primary versus
secondary hierarchy, card structure, dividers, shadows, borders, input styling.

**Colour.** Which token carries the background, which carries the panel, where
the single accent lands, text colour hierarchy, border logic, shadow mood.

**Structure.** Grid, section ordering, density, visual rhythm, repeated motifs.

If something is unclear, go back and improve the reference. Do not fill
ambiguity with a generic default.

---

## 6. Hero and first-view rules

The first viewport must be clean, readable and unhurried on a small laptop.

- Headline: 1 line ideally, 2 is good, 3 is the maximum. If it is running to 4,
  cut words rather than adding a line.
- One focal point. Not three competing ones.
- Supporting text stays short.
- Do not stuff the hero with fake stats, badges, tiny logos or micro-detail.
- A small laptop must still see: a clear headline, readable supporting text,
  clean spacing, and a visible CTA.
- Do not try to expose the whole product above the fold.

---

## 7. Anti-nested-box

Do not default to box-in-box-in-box. Specifically avoid:

- a giant rounded container wrapping an entire section
- cards inside cards inside cards
- dashboard-style compartment stacking for no reason
- sections that are one bordered panel holding more bordered panels

Prefer open layouts, whitespace, fewer but stronger containers, flatter
hierarchy, and alignment instead of enclosure. One primary framing move per
section, not four layered ones. GiftFinder's pages are paper and hairlines;
that is the framing, and it is usually enough.

---

## 8. Micro-UI clutter, with one carve-out

Avoid unnecessary pills, pseudo-system markers, fake control labels,
decorative code-like tags, filler chips, tiny badges everywhere, and
pseudo-enterprise microcopy that exists only to look complex.

**The carve-out: the uppercase tracked eyebrow is house style, not clutter.**
It is deliberate, it recurs by design, and stripping it in the name of
minimalism would fight the system rather than serve it. Same for `.chip` in the
quiz, where the pills are the actual interface. What this rule bans is
*decorative* labelling that carries no information - not the two label idioms
this site already uses on purpose.

---

## 9. Copy discipline

- **No em-dashes in anything a visitor reads.** They read as machine-written.
  Use a comma, a colon, or a full stop. Code comments are exempt.
- The site earns nothing and links straight to merchants. Copy like "nothing
  sponsored, nothing paid to rank" is only true while that holds. Do not write
  new claims about ranking, partnership or curation that the code does not
  back.
- Avoid filler: unleash, elevate, revolutionize, next-gen, seamless,
  transformative. Avoid fake brand names in placeholders - the catalogue is
  real, so pull a real product or a real occasion instead of inventing Acme.

---

## 10. Anti-slop

Beyond the copy rules above:

**Layout.** Endless centred sections. Identical card rows repeated section after
section. Cloned left-text-right-image blocks. Decorative empty space with no
purpose. Fake complexity without hierarchy.

**Visual.** Default purple and blue AI gradients - this palette has exactly one
accent and it is gold. Glowing edges. Floating blobs. Unmotivated glassmorphism.
Over-rendered noise that hides the layout. The one texture on this site is
`.paper-grain`, and it is deliberately faint.

**Typography.** Giant heading over weak tiny subcopy. Too many font moods - here
there are two faces and no more. Awkward line breaks. Lazy all-caps outside the
eyebrow. Gradient headline tricks.

**Density.** Over-packed sections, card overload, tight gaps between major
sections, visually exhausting walls of content.

---

## 11. Section rhythm and spacing

A strong page does not repeat one block forever. Vary density, image-to-text
ratio, alignment, scale, whitespace, and background intensity across sections
while keeping spacing controlled and the page coherent.

Let the page breathe. Even section spacing, intentional major gaps, negative
space doing real work. Never one cramped section beside an empty one.

---

## 12. Architectural constraints that outrank visual preference

These are settled decisions in `AGENTS.md`. A design that requires breaking one
of them is the wrong design, not a reason to break it.

- **The gift detail view is an overlay, not a route.** There is no `/gift/[id]`.
  Results live in the tab's memory, computed from quiz answers never written to
  the URL, so routing away would lose the grid or force the quiz to re-run. The
  quiz reveals in place for the same reason. Do not "improve" either into a
  route.
- **No LLM at request time.** `/api/recommend` and `/api/similar` are a
  Postgres query plus pure scoring. A visual idea that needs a model call on the
  request path breaks both the latency budget and the "about 30 seconds"
  promise.
- **No affiliate layer, no tracking parameters.** Do not add any.
- The recommend route's `select` lists only what scoring reads. Needing a new
  field on a card means adding it to the second query keyed on surviving ids,
  not widening the first.

---

## 13. Before you finish

1. Was the graph queried to scope the change, and its freshness checked?
2. Was there a rendered reference, or a defensible reason there was none?
3. Was it actually analysed, or glanced at?
4. Does the implementation match it, or did it drift generic?
5. Tokens used rather than raw hex?
6. Existing classes reused rather than re-invented?
7. Hero within 3 lines, first view clean on a small laptop?
8. Any new nested boxes? Any decorative micro-labels beyond the eyebrow?
9. Any em-dash in visitor-facing copy?
10. New motion neutralised under `prefers-reduced-motion`?
11. Contrast intact - gold not lightened?
12. **Screenshotted at desktop and mobile, console clean, proof shared?**

Item 12 is not optional. A visual change you have not looked at is not finished.
