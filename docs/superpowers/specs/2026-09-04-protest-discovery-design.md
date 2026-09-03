# Protest Discovery — Design Spec

**Date:** 2026-09-04
**Status:** Approved for planning
**Summary:** A two-tier discovery pipeline that proposes new protest movements for review. Wikidata supplies high-precision, pre-named movements; GDELT supplies breadth for protests Wikipedia has not yet documented. Both feed one candidate queue. Nothing is published without a human promoting it.

---

## 1. Problem

`scripts/movements.config.json` holds four hand-written movements. There is no mechanism by which a fifth can appear. A protest not already in that file has no feed pointed at it and no keyword list to match, so it never enters the system. The site therefore misses essentially every protest happening in the world.

## 2. Goals

- Detect protest movements globally, without pre-registering them.
- Propose them as reviewable candidates with enough metadata that promoting one is a minutes-long edit, not an hour of research.
- Never publish an unreviewed movement.
- Add no API key, no paid service, and no runtime dependency.

## 3. Non-goals

- Auto-publishing. Explicitly rejected: false positives and auto-generated keywords would permanently degrade the archive.
- LLM-generated prose or config. Rejected to keep CI keyless, free, and deterministic.
- Replacing `aggregate.mjs`. Discovery finds movements; the existing RSS aggregator tracks them. GDELT and Wikidata never contribute an article to a movement's feed.

## 4. Constraints (from the existing repo)

- Static export, no server, no database. Discovery runs in GitHub Actions and commits JSON.
- Node built-ins only (`fetch`, `node:fs`). No new npm dependencies.
- `aggregate.mjs` creates a movement's data directory on demand (`writeJson` mkdirs recursively), and every curated reader in `lib/server-data.ts` falls back to empty. **Therefore promoting a movement requires appending one config block and nothing else** — `sitemap`, `feeds`, `search-index`, and `og-images` all derive from `movements.json`.
- Adding a brand-new movement id needs one rebuild to mint its static page (existing documented behaviour).
- The About page commits to neutrality. Discovery must not quietly file contested events; the review gate is what upholds this.

## 5. Architecture

```
discover.mjs (daily)
  ├── tier1_wikidata()  ── SPARQL ──> named, described, country-tagged movements
  └── tier2_gdelt()     ── DOC API ─> clustered article groups
            │
            ▼
   discovery/state.json      (persistent clusters, promoted/rejected sets)
   discovery/candidates.json (the review queue)
            │
            ▼  human runs promote.mjs
   scripts/movements.config.json  ──> existing aggregate.mjs pipeline (untouched)
```

Discovery lives in a **separate script and separate workflow** from aggregation. A discovery failure cannot block a deploy, and a discovery bug cannot corrupt the archive.

State files live in `discovery/`, **not** `public/data/`, so half-formed clusters are never served on the public site.

## 6. Tier 1 — Wikidata

A daily SPARQL query against `https://query.wikidata.org/sparql`. Validated query shape:

```sparql
SELECT ?item ?itemLabel ?itemDescription ?article
       (GROUP_CONCAT(DISTINCT ?cl; separator=", ") AS ?countries) WHERE {
  ?item wdt:P31/wdt:P279* wd:Q273120 ; wdt:P580 ?start .
  FILTER(?start >= "<CUTOFF>"^^xsd:dateTime)
  OPTIONAL { ?item wdt:P17 ?c . ?c rdfs:label ?cl . FILTER(lang(?cl)="en") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,id,fr,pt,de,ar". }
} GROUP BY ?item ?itemLabel ?itemDescription ?article
```

`<CUTOFF>` is substituted at runtime with an ISO datetime 18 months before the run, giving overlap against the rejected/promoted sets rather than a moving edge that could drop an item.

Measured: 41 distinct protests with a start date in the trailing 12 months — roughly 3–4 candidates per month.

Handling of observed data defects:

- **Multi-valued `P17`.** Solidarity protests abroad duplicate an item across countries (`2025 Bulgarian protests` appeared under Spain, US, Belgium, Austria). `GROUP BY ?item` with `GROUP_CONCAT` collapses these; the first country is the primary, the rest are recorded.
- **Missing labels.** Some items return a bare Q-id (`Q139760353`). The label service falls back through `en,es,id,fr,pt,de,ar`; an item still resolving to `/^Q\d+$/` is queued with a `needsName` flag rather than dropped.
- **Non-movement entities.** `2026 Mexico cartel unrest`, `2026 Baghdad clashes`, and `2026 Iranian pro-government rallies` are all instances of the protest class but are not what this archive documents. No automated filter is attempted; these are the review gate's job.

Requires a descriptive `User-Agent` per Wikimedia policy.

Tier 1 candidates carry `confidence: "high"` and a rich `suggested` block: name, description (verbatim from Wikidata), country, region, year, and the Wikipedia article URL.

## 7. Tier 2 — GDELT

Daily queries to `https://api.gdeltproject.org/api/v2/doc/doc` (`mode=artlist&format=json`). No key. **Rate limit: one request per 5 seconds** — exceeding it returns HTTP 429 with a plain-text body, which `curl`/`fetch` report as a success, so the client must detect non-JSON responses explicitly and back off.

`theme:PROTEST` was measured and rejected: it returned a case-law listing, an opinion column, and a poultry-shop closure. Plain-text protest lexicons are used instead.

### 7.1 Query matrix

One pass per (language, country-set) pair, serialized at 6s spacing (~20 queries, ~2 minutes):

| lang | terms | countries |
|---|---|---|
| eng | protest, demonstration, rally, strike, march, walkout, sit-in, blockade | global, NG, KE, IN, ZA, PH |
| spa | protesta, manifestación, huelga, paro, marcha | ES, CL, AR, MX, CO, PE |
| ind | unjuk rasa, demo, mogok | ID |
| fra | manifestation, grève | FR, SN, CI |
| por | protesto, greve, manifestação | BR, PT |

English-only querying was measured to skew heavily India/US (26 of 30 results). The matrix exists to correct that.

### 7.2 Clustering

Per article: tokenize title, strip per-language stopwords, retain **distinctive terms** — tokens appearing in fewer than 5% of the run's protest corpus, capped at the 8 rarest per title. This is what suppresses `police`, `government`, and `protest` itself. The 5% figure is a starting value to be tuned against captured fixtures, not a derived constant.

Incremental matching against existing state: an article joins a cluster when `sourcecountry` matches **and** Jaccard overlap of distinctive terms `>= 0.4`; otherwise it seeds a new cluster.

Each cluster accumulates: `domains` (set), `daysSeen` (set of ISO dates), `articleCount`, `firstSeen`, `lastSeen`, and up to 5 sample articles.

Clusters idle for **21 days** are evicted so state cannot grow without bound.

### 7.3 Graduation

A cluster becomes a candidate when `domains.size >= 3 && daysSeen.size >= 3` — the sustained, multi-outlet bar. This is computable only because GDELT returns a real publisher `domain`; Google News RSS does not, which is why it cannot serve as the discovery source.

Tier 2 candidates carry `confidence: "low"` and a best-effort `suggested` block.

A domain denylist drops non-news sources observed in probes (`indiankanoon.org` case law, opinion aggregators).

## 8. Shared queue and suppression

`discovery/candidates.json`:

```json
{
  "generated": "2026-09-04T00:00:00Z",
  "candidates": [{
    "key": "wd-Q123456",
    "source": "wikidata",
    "confidence": "high",
    "country": "Indonesia",
    "wikipedia": "https://en.wikipedia.org/wiki/...",
    "samples": [{ "title": "", "url": "", "domain": "", "date": "" }],
    "suggested": {
      "id": "indonesia-corruption",
      "name": "June 2026 Indonesian protests",
      "description": "",
      "region": "Asia",
      "location": "Indonesia",
      "year": 2026,
      "keywords": [],
      "strictKeywords": [],
      "feeds": []
    }
  }]
}
```

`domains`, `daysSeen`, and `articleCount` are **Tier 2 only** — Wikidata candidates have no article cluster behind them and omit these fields. `wikipedia` is Tier 1 only. Consumers must treat both sets as optional.

`suggested.location` is set to the country name, never a city: Wikidata's `P17` gives a country and nothing finer. Narrowing it to a city is a review-time edit.

`suggested.id` is a slug derived from country plus the most distinctive term in the name (`indonesia-corruption`), deduplicated against existing config keys with a numeric suffix.

`suggested.feeds` is generated, not empty: one Google News RSS search URL per language/region for the movement name, plus — for Tier 1 — nothing else. Publisher feeds are the highest-value review-time addition and are deliberately left to the human, since they are what keeps a feed clean.

Three suppressions, all held in `discovery/state.json`:

1. **Already tracked** — candidate terms overlap an existing movement's `keywords`/`strictKeywords` in the same country. Attributed to that movement, not proposed. (`2026 Delhi Jantar Mantar protests` must resolve to the existing `india-cjp`.)
2. **Already promoted.**
3. **Previously rejected** — a dismissed candidate never returns.

Region is assigned by a country→region table producing the strings already in use (`Asia`, `Africa`, `Americas`) plus `Europe`, `Middle East`, `Oceania`. `lib/regions.ts` derives the region list from data, so a new region needs no code change.

## 9. Promote

`node scripts/promote.mjs <candidate-key>`:

1. Reads `candidates.json`, resolves the key.
2. Appends the `suggested` block to `movements.config.json`.
3. Marks the cluster promoted in state.
4. Prints next steps: edit keywords, add publisher feeds, run `npm run aggregate -- <id>`.

`node scripts/promote.mjs --reject <key>` adds to the rejected set.

For Tier 1 candidates with a Wikipedia article, `--with-background` seeds `background.json` from the article's lead section with a visible CC BY-SA attribution block. This addresses the otherwise-empty Timeline/Background/Legal/Sources sections that a bare new movement renders.

## 10. CI

New `.github/workflows/discover.yml`:

- `schedule: cron "0 3 * * *"` (daily) plus `workflow_dispatch`.
- Runs `node scripts/discover.mjs`.
- `continue-on-error: true` — discovery must never break the site.
- Commits `discovery/` only. The existing deploy workflow stages `public/data` and is not modified.
- Renders the candidate table into `$GITHUB_STEP_SUMMARY` for review without opening the repo.

No GitHub Issues API in v1.

## 10a. Phasing

The two tiers are independently shippable and should be separate implementation plans:

- **Phase 1** — Tier 1 (Wikidata), the candidate queue, `promote.mjs`, tests, CI. Delivers reviewable global candidates with the smallest possible surface, and proves the promote path.
- **Phase 2** — Tier 2 (GDELT), clustering, state eviction, the query matrix. Builds on a promote path already in use.

Phase 1 is the subject of the first implementation plan. Phase 2 follows once Phase 1 is running.

## 11. Testing

The repo has no test runner. Add `node --test` (built into Node 20/24, zero dependencies) as `npm test`.

All network access sits behind a single `fetchJson(url)` so the pure logic is testable against fixtures captured from live probes.

Unit-tested: distinctive-term extraction, stopword stripping, Jaccard cluster matching, graduation thresholds, 21-day eviction, existing-movement suppression, country→region mapping, Wikidata multi-country collapsing, bare-Q-id label fallback, GDELT 429 non-JSON detection.

## 12. Risks

- **Tier 2 clustering will mis-group.** Same-country protests over different issues will sometimes merge, and one protest described two ways will sometimes split. Review catches this; the design does not prevent it.
- **Suggested keywords will often be mediocre.** This is the accepted cost of excluding an LLM, and the reason promotion is manual.
- **Wikidata lags.** Items appear once an editor documents them; the trailing window at time of writing showed a ~6-week gap at the head. Tier 2 exists to cover this.
- **Two upstreams, no SLA.** Either being down degrades to "no candidates today", which is safe.
- **Neutrality.** Wikidata's protest class includes pro-government rallies and armed unrest. Only the human review gate keeps these out.

## 13. File inventory

| Path | Status |
|---|---|
| `scripts/discover.mjs` | new |
| `scripts/promote.mjs` | new |
| `scripts/lib/discovery/*.mjs` | new — pure, tested helpers |
| `test/discovery/*.test.mjs` | new |
| `discovery/state.json`, `discovery/candidates.json` | new, generated |
| `.github/workflows/discover.yml` | new |
| `package.json` | modified — add `test`, `discover`, `promote` scripts |
| `scripts/aggregate.mjs` | **unmodified** |
| `.github/workflows/deploy.yml` | **unmodified** |
