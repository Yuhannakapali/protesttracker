# ProtestTracker — Design Spec

**Date:** 2026-07-23
**Domain:** protesttracker.net
**Summary:** A production Next.js static site: an automatically updated archive of protest movements worldwide. Ink-and-paper documentary aesthetic. Content is fetched client-side from JSON so an external aggregation script can overwrite it without touching code.

---

## 1. Stack & Build

- Next.js 14, **pages router**, static export.
- `next.config.js`: `output: 'export'`, `images: { unoptimized: true }`, `trailingSlash: true`.
- Google Fonts via `next/font/google` (self-hosted at build — no runtime CDN, works on GitHub Pages and offline):
  - Newsreader (serif) — display/headlines
  - IBM Plex Sans — body/UI
  - IBM Plex Mono — labels, dates, metadata
- No backend, no database, no localStorage.
- Deploy: GitHub Pages + custom domain. `/public/CNAME` = `protesttracker.net` (already present).

## 2. Data-Fetching Architecture (key pattern)

- `getStaticPaths` reads `/public/data/movements.json` **at build time only**, to enumerate which `/movements/[id]/` pages to statically generate. `getStaticProps` passes just `{ id }`.
- **All content — including `movements.json` — is fetched client-side at runtime** via `fetch()` against `/data/...`. The aggregation script can overwrite any JSON and the live site reflects it with no rebuild.
- Exception: adding a brand-new movement id needs one rebuild to mint its static page. Documented in README.
- `lib/data.js` — base-path-aware fetch helpers (`fetchJSON(path)`), tolerant of missing per-movement files (returns null / empty so archived movements render "not compiled" states).

## 3. Routes / Views

- `/` **Home** — cards for movements where status is Active or Escalating, sorted most-recent. Header line "N active". Each card: status badge, name (Newsreader), location, one-line description, article count, "updated" label, 2–3 latest headlines inline. Link to Archive below. **Empty state:** if none active, show the archive list plus a short note (real wired state, not blank).
- `/archive/` **Archive** — all non-active movements (Quiet, Dormant, Concluded) as cards linking to movement pages. Filter chips/dropdowns for Region and Year, derived dynamically from data. **Empty-filter state:** "No archived movements match the current filters."
- `/movements/[id]/` **Movement** — statically generated per id. Sticky in-page sub-nav scroll-jumping to:
  - **Live Feed** — articles grouped by date with sticky date headers (mono date stamp + long label). Item: source, headline (links out), excerpt, time-ago. Search box + source filter chips (derived from movement's sources, includes "All"). No-results text when search/filter empty; distinct "not yet compiled" style message for archived movements with no feed.
  - **Timeline** — vertical timeline, each event date + title + body. Archived-empty: "Key events for this archived movement have not been compiled."
  - **Background** — long-form from ordered heading/paragraph blocks, Newsreader, comfortable measure.
  - **Legal Tracker** — cards: case name, court, status badge (reuse 5-status colors), short label, summary, last-updated. Handle empty.
  - **Sources** — outlets with type tag + cadence note. Archived-empty: "Source list for this archived movement is not available."
- `/about/` **About** — exact neutrality copy (below), how-it-works section, status legend.

### About neutrality copy (verbatim)
> This archive takes no position on the movements it documents. It is not affiliated with any political group, party, or government, and it does not campaign, endorse, or editorialise. Its purpose is to preserve and organise the public record: coverage from many outlets, presented side by side, dated and attributed.

## 4. Design System

CSS custom properties on `:root` (light) and `:root[data-theme="dark"]`. Inline no-flash theme script in `_document.js`: reads `pt-theme` cookie, else system `prefers-color-scheme`, sets `data-theme` before paint. Toggle writes the cookie (no localStorage).

**Light tokens:** `--paper:#f6f3ec; --paper2:#fbf9f3; --paper3:#efe9dd; --ink:#1c1815; --ink2:#57514a; --ink3:#8a8278; --line:#ddd6c9; --line2:#c9c1b2; --accent:#c1402b; --accentink: color-mix(in srgb, var(--accent) 84%, #221b12); --accentsoft: color-mix(in srgb, var(--accent) 8%, transparent); color-scheme:light`

**Dark tokens:** `--paper:#15120e; --paper2:#1d1914; --paper3:#241f18; --ink:#ece7dd; --ink2:#a89f92; --ink3:#7a7266; --line:#322c23; --line2:#463d32; --accent:#e0664e; --accentink: color-mix(in srgb, var(--accent) 90%, #fff); --accentsoft: color-mix(in srgb, var(--accent) 14%, transparent); color-scheme:dark`

**Status colors [text, background]:**

| Status | Light | Dark |
|---|---|---|
| Active | `#2f7d4f` / `#e6f0e7` | `#7fc79b` / `#1c2a20` |
| Escalating | `#b06a13` / `#f4ebda` | `#d9a35a` / `#2c2416` |
| Quiet | `#3a6491` / `#e4ebf2` | `#86accf` / `#1a2530` |
| Dormant | `#6b5a86` / `#ece7f0` | `#b3a0cc` / `#251f2e` |
| Concluded | `#6a6459` / `#eae5db` | `#a8a094` / `#26221b` |

**Status meanings (legend):** Active = steady ongoing coverage; Escalating = sharp sustained rise in article volume; Quiet = still developing but coverage slowed; Dormant = no significant activity for an extended period; Concluded = movement ended or resolved.

**Header:** sticky, `--paper` bg, bottom border `--line`, 60px tall, max-width 1120px. Left: 15px accent square + "ProtestTracker" (Newsreader 600/20px) + mono "ARCHIVE" chip. Center: mono 12px search input (magnifier glyph) searching movements + articles. Right: nav Home/Archive/About + theme toggle (glyph + label). Responsive: search full-width under 680px; labels hide under 400px.

**Footer:** top border, mono 11px: "Independently maintained archive. Not affiliated with any political group, party, or government."

**Motion:** shimmer keyframe for skeletons; pulse for live dot. `prefers-reduced-motion`: disable smooth scroll + animations. Skeleton loaders ~750ms on first load unless reduced motion.

**Shared components:** Header, Footer, StatusBadge, MovementCard, Skeleton, LiveDot, sub-nav.

## 5. Helpers (`lib/dates.js`)

`groupByDate(items)`, `dateStamp(date)`, `longDate(date)`, `timeAgo(date)`.

## 6. Data Model

**`/public/data/movements.json`:**
```json
{ "lastUpdated": "ISO", "movements": [
  { "id","name","status","active":true,"region","location","year",
    "logged":"YYYY-MM-DD","articleCount":0,"updated":"2h ago",
    "description","latestHeadlines":[{"title","source","date"}] } ] }
```

**Per-movement `/public/data/{id}/`:**
- `articles.json`: `{ articles: [{ title, source, url, date, excerpt }] }` (newest first)
- `timeline.json`: `{ events: [{ date, title, body }] }`
- `background.json`: `{ blocks: [{ type:"h"|"p", text }] }`
- `legal.json`: `{ cases: [{ name, court, status, label, summary, updated }] }`
- `sources.json`: `{ sources: [{ name, type, note }] }`

`articles.json` and `movements.json` are machine-written; timeline/background/legal/sources are hand-curated and never touched by automation. Status comes only from `movements.json`.

## 7. Seed Data

- **`india-cjp`** — "Cockroach Janta Party / NEET Protests", region Asia, location "India · Delhi & NCR", year 2026, status Escalating, active true. Real sourced articles (CNN, Al Jazeera x2, New Lines), 7 timeline events (2026-05-10 → 2026-07-21), background blocks (NEET, 2026 scandal, movement formation, demands + police response, youth unemployment > 15%), 2 legal cases, sources (CNN, Al Jazeera, New Lines, The Hindu, Scroll.in, Reuters, BBC). Neutral documentary tone, **no em-dashes**.
- **`nigeria-fuel`** — fuel-subsidy movement, SAMPLE data. Active or Escalating (Home demo).
- **`chile-pension`** — pension-reform movement, SAMPLE data.
- One **Concluded/archived** movement, SAMPLE data (Archive + empty-state demos).
- Sample articles marked SAMPLE in a code comment.

## 8. Aggregation & Automation

**`scripts/movements.config.json`** maps each id → `{ name, region, location, year, keywords[], feeds[] (RSS URLs), manualStatus }`. Seed `india-cjp` with Google News RSS search feeds for "Cockroach Janta Party", "NEET protest Delhi", "Jantar Mantar protest".

**`scripts/aggregate.mjs`:**
1. Fetch each RSS feed; fail per-feed without crashing.
2. Normalize to `{ title, source, url, date, excerpt }`; strip HTML.
3. Keyword-filter; dedupe by URL and near-identical title.
4. Merge with existing `articles.json`; sort newest-first; cap 500.
5. Compute status: last 7 days → Active; 8–30 days → Quiet; > 30 days → Dormant; last-48h count ≥ 3× trailing-14-day daily average → Escalating; `manualStatus` overrides.
6. Rewrite each `articles.json`; regenerate `movements.json` (statuses, counts, latest headlines, timestamps). Never touch timeline/background/legal/sources.

**GitHub Actions:** run on push to main + 2-hourly cron → run script → commit changed JSON if any → build → deploy `out/` to GitHub Pages.

## 9. Caveats (verify during build)

- Google News RSS URL encoding is finicky. Verify the query URLs actually return items; note any adjustments in README.
- Running `aggregate.mjs` during setup needs outbound network. If blocked in the build environment, seed `india-cjp` `articles.json` from the provided real data and note that the script is CI-ready.

## 10. Deliverables

- Working `npm run dev` and `npm run build` producing static `out/`.
- README: adding a movement (config entry + data folder), editing curated data, how status is computed, DNS/custom-domain setup, RSS-query verification note.
- Aggregation run once during setup so the India feed is not empty on first deploy.

## 11. Quality Floor

Responsive to mobile; visible keyboard focus; reduced-motion respected; real loading and empty states everywhere. Accent used sparingly; generous whitespace; hairline rules; mono for metadata.
