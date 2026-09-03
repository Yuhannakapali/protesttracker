# Protest Discovery Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find protest movements that Wikipedia has not documented yet, by clustering GDELT news coverage and graduating only clusters that are sustained across days and reported by multiple outlets.

**Architecture:** A new GDELT tier runs after the Phase 1 Wikidata tier inside the same `scripts/discover.mjs`. Articles are fetched per (language, country) pair, tokenized, reduced to distinctive terms, and matched into persistent clusters held in `discovery/state.json`. A cluster graduates to a candidate at 3+ distinct domains across 3+ distinct days. Both tiers write into one candidate queue; Tier 2 candidates are marked `confidence: "low"`.

**Tech Stack:** Node 20+ built-ins only (`fetch`, `node:fs`, `node:test`, `node:assert`). No npm dependencies. ES modules (`.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-04-protest-discovery-design.md` (§7 Tier 2)

## Global Constraints

- **No new npm dependencies.** Node built-ins only.
- **Never modify `scripts/aggregate.mjs` or `.github/workflows/deploy.yml`.**
- **GDELT rate limit: one request per 5 seconds.** Violations return HTTP 200 with a plain-text body. `fetchJson` (Phase 1) already rejects non-JSON bodies; queries must be serialized with **6s** spacing.
- **`theme:PROTEST` is rejected** — measured noisy (returned case law, an opinion column, a poultry-shop closure). Use plain-text lexicons.
- **State lives in `discovery/`, never `public/data/`.**
- **Nothing is published automatically.** Tier 2 only ever writes candidates.
- **JSON written with 2-space indent and trailing newline.**
- Conventional commit prefixes. No `Co-Authored-By` trailer, no tool attribution.

## Measured GDELT facts (from live probes)

- Article shape: `{ url, url_mobile, title, seendate, socialimage, domain, language, sourcecountry }`.
- `seendate` is compact ISO: `"20260902T003000Z"` — **not** parseable by `new Date()` directly.
- **Titles are truncated at ~60 characters** and carry spaced punctuation (`"Lagos Pensioners Protest : Police Deny Teargassing , CDHR Dema"`). Titles are the only text available — there is no article body — so tokenization must cope with few, sometimes clipped, tokens.
- English-only querying skews India/US (measured 26 of 30). The language matrix exists to correct this.
- **OR'd terms MUST be wrapped in parentheses.** `query=protest OR demonstration` returns the plain-text error `"Queries containing OR'd terms must be surrounded by ()."` — served as **HTTP 200**, so it is caught only by the non-JSON guard in `fetchJson`. `buildGdeltUrl` wraps the phrase for this reason; a test asserts it.

## File Structure

| Path | Responsibility |
|---|---|
| `scripts/lib/discovery/gdelt.mjs` | Query matrix, URL building, article normalization. Pure. |
| `scripts/lib/discovery/tokenize.mjs` | Tokenization, multilingual stopwords, distinctive terms. Pure. |
| `scripts/lib/discovery/cluster.mjs` | Syndication collapse, shared-term matching, accumulation, eviction. Pure. |
| `scripts/lib/discovery/graduate.mjs` | Domain denylist, graduation thresholds, cluster→entity naming. Pure. |
| `scripts/discover.mjs` | Modified — runs both tiers into one queue. |
| `test/discovery/*.test.mjs` | `node --test` suites. |

---

### Task 1: GDELT query matrix and article normalization

**Files:**
- Create: `scripts/lib/discovery/gdelt.mjs`
- Test: `test/discovery/gdelt.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `GDELT_ENDPOINT: string`
  - `QUERY_MATRIX: Array<{ lang: string, terms: string[], countries: string[] }>`
  - `buildGdeltUrl({ lang, terms, country }): string`
  - `parseArticles(json): Array<{ title, url, domain, country, date, language }>`
  - `seendateToIso(seendate: string): string`

- [ ] **Step 1: Write the failing test**

Create `test/discovery/gdelt.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUERY_MATRIX, buildGdeltUrl, parseArticles, seendateToIso } from '../../scripts/lib/discovery/gdelt.mjs';

test('converts GDELT compact seendate to an ISO day', () => {
  assert.equal(seendateToIso('20260902T003000Z'), '2026-09-02');
});

test('returns empty string for an unparseable seendate', () => {
  assert.equal(seendateToIso('garbage'), '');
  assert.equal(seendateToIso(undefined), '');
});

test('builds a query URL with the language and country filters', () => {
  const url = buildGdeltUrl({ lang: 'spa', terms: ['protesta', 'huelga'], country: 'Chile' });
  assert.ok(url.startsWith('https://api.gdeltproject.org/api/v2/doc/doc?'));
  assert.ok(url.includes('mode=artlist'));
  assert.ok(url.includes('format=json'));
  assert.ok(decodeURIComponent(url).includes('sourcelang:spa'));
  assert.ok(decodeURIComponent(url).includes('sourcecountry:Chile'));
  assert.ok(decodeURIComponent(url).includes('protesta OR huelga'));
});

test('wraps OR-ed terms in parentheses, which GDELT requires', () => {
  // Without parens GDELT replies HTTP 200 with:
  // "Queries containing OR'd terms must be surrounded by ()."
  const url = buildGdeltUrl({ lang: 'eng', terms: ['protest', 'demonstration'], country: null });
  assert.ok(decodeURIComponent(url).includes('(protest OR demonstration)'));
});

test('quotes multi-word terms so they are matched as phrases', () => {
  const url = buildGdeltUrl({ lang: 'ind', terms: ['unjuk rasa', 'demo'], country: 'Indonesia' });
  assert.ok(decodeURIComponent(url).includes('"unjuk rasa"'));
});

test('omits the country filter for a global pass', () => {
  const url = buildGdeltUrl({ lang: 'eng', terms: ['protest'], country: null });
  assert.ok(!decodeURIComponent(url).includes('sourcecountry:'));
});

test('defaults to a wide window and a high record cap', () => {
  // Measured: a sparse 2d/75 global sample produced 63 singleton clusters and
  // one false positive. 7d/250 per country produced 5 real movements.
  const url = buildGdeltUrl({ lang: 'eng', terms: ['protest'], country: 'India' });
  assert.ok(url.includes('timespan=7d'));
  assert.ok(url.includes('maxrecords=250'));
});

test('never uses the rejected theme:PROTEST operator', () => {
  for (const row of QUERY_MATRIX) {
    const url = buildGdeltUrl({ lang: row.lang, terms: row.terms, country: row.countries[0] });
    assert.ok(!decodeURIComponent(url).includes('theme:'));
  }
});

test('the matrix covers the languages the spec requires', () => {
  const langs = QUERY_MATRIX.map((r) => r.lang);
  for (const l of ['eng', 'spa', 'ind', 'fra', 'por']) assert.ok(langs.includes(l), `missing ${l}`);
});

test('normalizes articles and drops ones missing a title, domain, or country', () => {
  const out = parseArticles({
    articles: [
      { title: 'A protest', url: 'https://x.test/1', domain: 'x.test', sourcecountry: 'Kenya', seendate: '20260902T003000Z', language: 'English' },
      { title: '', url: 'https://x.test/2', domain: 'x.test', sourcecountry: 'Kenya', seendate: '20260902T003000Z' },
      { title: 'No country', url: 'https://x.test/3', domain: 'x.test', sourcecountry: '', seendate: '20260902T003000Z' },
    ],
  });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    title: 'A protest', url: 'https://x.test/1', domain: 'x.test',
    country: 'Kenya', date: '2026-09-02', language: 'English',
  });
});

test('returns an empty array for a malformed payload', () => {
  assert.deepEqual(parseArticles({}), []);
  assert.deepEqual(parseArticles(null), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "test/discovery/gdelt.test.mjs"`
Expected: FAIL — cannot find module `gdelt.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/gdelt.mjs`:

```javascript
// GDELT is the breadth tier: it finds protests before anyone writes a
// Wikipedia article about them. It is noisy by nature, so nothing here
// decides anything — clustering and the graduation bar do that.
//
// theme:PROTEST was measured and rejected: GDELT's thematic tagging returned
// a case-law listing, an opinion column and a poultry-shop closure. Plain
// text lexicons are more predictable.

export const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

// One pass per (language, country). English-only querying was measured to
// skew heavily India/US, which is why the non-English rows exist.
export const QUERY_MATRIX = [
  { lang: 'eng', terms: ['protest', 'demonstration', 'rally', 'strike', 'march', 'walkout', 'blockade'],
    countries: ['Nigeria', 'Kenya', 'India', 'SouthAfrica', 'Philippines', 'UnitedKingdom'] },
  { lang: 'spa', terms: ['protesta', 'manifestacion', 'huelga', 'paro', 'marcha'],
    countries: ['Spain', 'Chile', 'Argentina', 'Mexico', 'Colombia', 'Peru'] },
  { lang: 'ind', terms: ['unjuk rasa', 'demo', 'mogok'], countries: ['Indonesia'] },
  { lang: 'fra', terms: ['manifestation', 'greve'], countries: ['France', 'Senegal', 'IvoryCoast'] },
  { lang: 'por', terms: ['protesto', 'greve', 'manifestacao'], countries: ['Brazil', 'Portugal'] },
];

export function buildGdeltUrl({ lang, terms, country, timespan = '7d', maxrecords = 250 }) {
  const phrase = terms.map((t) => (t.includes(' ') ? `"${t}"` : t)).join(' OR ');
  const parts = [`(${phrase})`, `sourcelang:${lang}`];
  if (country) parts.push(`sourcecountry:${country}`);
  const query = encodeURIComponent(parts.join(' '));
  return `${GDELT_ENDPOINT}?query=${query}&mode=artlist&maxrecords=${maxrecords}&format=json&timespan=${timespan}`;
}

// "20260902T003000Z" -> "2026-09-02". new Date() cannot parse the compact form.
export function seendateToIso(seendate) {
  const m = String(seendate || '').match(/^(\d{4})(\d{2})(\d{2})T/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export function parseArticles(json) {
  const rows = json?.articles;
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const a of rows) {
    const title = String(a?.title || '').trim();
    const domain = String(a?.domain || '').trim().toLowerCase();
    const country = String(a?.sourcecountry || '').trim();
    const date = seendateToIso(a?.seendate);
    // Without all four we cannot cluster, attribute, or date the item.
    if (!title || !domain || !country || !date) continue;
    out.push({ title, url: String(a.url || ''), domain, country, date, language: String(a.language || '') });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 55 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/gdelt.mjs test/discovery/gdelt.test.mjs
git commit -m "feat: add GDELT query matrix and article normalizer"
```

---

### Task 2: Tokenization and distinctive terms

**Files:**
- Create: `scripts/lib/discovery/tokenize.mjs`
- Test: `test/discovery/tokenize.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `tokenize(title: string): string[]`
  - `documentFrequency(tokenLists: string[][]): Map<string, number>`
  - `distinctiveTerms(tokens: string[], df: Map, corpusSize: number, opts?: { maxTerms?: number, maxDocFreq?: number }): string[]`

**Why distinctive terms:** every protest article contains "protest" and most contain "police" or "government". Clustering on raw tokens would merge the whole corpus into one blob. Keeping only tokens rarer than 5% of the corpus is what leaves the topic words that actually distinguish one movement from another.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/tokenize.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, documentFrequency, distinctiveTerms } from '../../scripts/lib/discovery/tokenize.mjs';

test('lowercases, strips punctuation, and drops short tokens', () => {
  // GDELT spaces its punctuation: "Protest : Police Deny , CDHR Dema"
  assert.deepEqual(
    tokenize('Lagos Pensioners Protest : Police Deny Teargassing , CDHR'),
    ['lagos', 'pensioners', 'police', 'deny', 'teargassing', 'cdhr'],
  );
});

test('folds diacritics so Spanish and Portuguese cluster with their ASCII forms', () => {
  assert.deepEqual(tokenize('Manifestación en Bogotá'), ['manifestacion', 'bogota']);
});

test('drops multilingual stopwords and generic protest vocabulary', () => {
  assert.deepEqual(tokenize('the protest de la huelga dos protestos'), []);
});

test('documentFrequency counts each term once per document', () => {
  const df = documentFrequency([['tax', 'tax', 'kenya'], ['tax', 'nairobi']]);
  assert.equal(df.get('tax'), 2);
  assert.equal(df.get('kenya'), 1);
});

test('distinctiveTerms keeps rare terms and drops corpus-wide ones', () => {
  // "police" appears in 100 of 100 docs; "msp" in 2.
  const df = new Map([['police', 100], ['msp', 2], ['punjab', 3]]);
  const out = distinctiveTerms(['police', 'msp', 'punjab'], df, 100);
  assert.ok(!out.includes('police'));
  assert.ok(out.includes('msp'));
  assert.ok(out.includes('punjab'));
});

test('distinctiveTerms caps the number of terms, rarest first', () => {
  const df = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
  const out = distinctiveTerms(['a', 'b', 'c', 'd'], df, 1000, { maxTerms: 2 });
  assert.deepEqual(out, ['a', 'b']);
});

test('a term absent from the corpus map is treated as maximally rare', () => {
  const out = distinctiveTerms(['unseen'], new Map(), 100);
  assert.deepEqual(out, ['unseen']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "test/discovery/tokenize.test.mjs"`
Expected: FAIL — cannot find module `tokenize.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/tokenize.mjs`:

```javascript
// Titles are the only text GDELT gives us — there is no article body, and
// titles arrive truncated at roughly 60 characters. So tokenization has to
// earn a lot from very little, and the stopword list carries the weight.

const DIACRITICS = /[\u0300-\u036f]/g;

// Function words across the five query languages, plus the protest
// vocabulary that by definition appears in every document in this corpus.
const STOPWORDS = new Set([
  // protest vocabulary — present in everything, distinguishes nothing
  'protest', 'protests', 'protesta', 'protestas', 'protesto', 'protestos',
  'demonstration', 'demonstrations', 'demo', 'manifestacion', 'manifestaciones',
  'manifestation', 'manifestations', 'manifestacao', 'manifestacoes',
  'rally', 'rallies', 'strike', 'strikes', 'huelga', 'huelgas', 'greve', 'grevistas',
  'paro', 'march', 'marcha', 'marches', 'riot', 'riots', 'unrest', 'clash', 'clashes',
  'walkout', 'blockade', 'unjuk', 'rasa', 'mogok', 'aksi',
  // English function words
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'are', 'was',
  'were', 'not', 'but', 'his', 'her', 'its', 'their', 'over', 'after', 'says', 'said',
  'new', 'amid', 'into', 'out', 'off', 'against', 'more', 'than', 'who', 'why', 'how',
  // Spanish / Portuguese
  'los', 'las', 'del', 'con', 'por', 'para', 'que', 'una', 'uno', 'sobre', 'como',
  'dos', 'das', 'nao', 'mais', 'seu', 'sua', 'pela', 'pelo', 'aos',
  // French
  'les', 'des', 'une', 'dans', 'pour', 'sur', 'aux', 'est', 'sont', 'par',
  // Indonesian
  'dan', 'yang', 'untuk', 'dari', 'dengan', 'para', 'akan', 'ini', 'itu',
]);

export function tokenize(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export function documentFrequency(tokenLists) {
  const df = new Map();
  for (const tokens of tokenLists) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  return df;
}

// Keep only tokens rarer than `maxDocFreq` of the corpus, rarest first. The
// 5% default is a starting value tuned against captured fixtures, not a
// derived constant.
export function distinctiveTerms(tokens, df, corpusSize, { maxTerms = 8, maxDocFreq = 0.05 } = {}) {
  const limit = Math.max(1, corpusSize * maxDocFreq);
  return [...new Set(tokens)]
    .filter((t) => (df.get(t) || 0) <= limit)
    .sort((a, b) => (df.get(a) || 0) - (df.get(b) || 0) || a.localeCompare(b))
    .slice(0, maxTerms);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 62 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/tokenize.mjs test/discovery/tokenize.test.mjs
git commit -m "feat: add title tokenization and distinctive-term extraction"
```

---

### Task 3: Clustering

**Files:**
- Create: `scripts/lib/discovery/cluster.mjs`
- Test: `test/discovery/cluster.test.mjs`

**Interfaces:**
- Consumes: the article shape from Task 1.
- Produces:
  - `sharedTermCount(a: string[], b: Iterable<string>): number`
  - `collapseSyndication(articles): Array<article & { domains: string[], days: string[] }>`
  - `clusterKey(article): string`
  - `assignToClusters(articlesWithTerms, clusters, opts?: { minShared?: number }): object` — returns the updated clusters map
  - `evictStale(clusters, nowMs, opts?: { maxIdleDays?: number }): object`

**Measured rationale:** Jaccard `>= 0.4` graduated **zero** clusters from 241 real Indian protest stories (0.3: zero, 0.2: one). Shared-term count `>= 2` graduated 5 correct, well-separated clusters from the same data. Jaccard penalizes set-size differences; with ~8 terms per truncated title and 2-3 shared, real pairs score ~0.2.

**Cluster shape:** `{ id, country, terms: string[], domains: string[], daysSeen: string[], articleCount, firstSeen, lastSeen, samples: Array<{title,url,domain,date}> }`. Sets are stored as arrays because the cluster is persisted as JSON.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/cluster.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedTermCount, collapseSyndication, assignToClusters, evictStale } from '../../scripts/lib/discovery/cluster.mjs';

const art = (over = {}) => ({
  title: 'x', url: 'https://a.test/1', domain: 'a.test',
  country: 'Kenya', date: '2026-09-01', terms: ['import', 'duty'], ...over,
});

test('sharedTermCount counts overlapping terms', () => {
  assert.equal(sharedTermCount(['a', 'b'], ['a', 'b']), 2);
  assert.equal(sharedTermCount(['a', 'b'], ['c', 'd']), 0);
  assert.equal(sharedTermCount(['a', 'b'], new Set(['a', 'c'])), 1);
});

test('sharedTermCount of empty sets is zero, never NaN', () => {
  assert.equal(sharedTermCount([], []), 0);
});

test('collapseSyndication treats identical titles as one story across domains', () => {
  const same = (dom, day) => ({ title: 'Traders Reject Duty Rise', url: `https://${dom}/1`, domain: dom, country: 'Kenya', date: day, terms: ['traders', 'duty'] });
  const out = collapseSyndication([same('a.test', '2026-09-01'), same('b.test', '2026-09-02')]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].domains.sort(), ['a.test', 'b.test']);
  assert.deepEqual(out[0].days.sort(), ['2026-09-01', '2026-09-02']);
});

test('articles sharing terms in the same country join one cluster', () => {
  const clusters = assignToClusters(
    [art(), art({ url: 'https://b.test/2', domain: 'b.test', terms: ['import', 'duty', 'traders'] })],
    {},
  );
  assert.equal(Object.keys(clusters).length, 1);
  const c = Object.values(clusters)[0];
  assert.equal(c.articleCount, 2);
  assert.deepEqual(c.domains.sort(), ['a.test', 'b.test']);
});

test('the same terms in a different country do not merge', () => {
  const clusters = assignToClusters([art(), art({ country: 'Uganda' })], {});
  assert.equal(Object.keys(clusters).length, 2);
});

test('unrelated terms seed separate clusters', () => {
  const clusters = assignToClusters([art(), art({ terms: ['fuel', 'subsidy'] })], {});
  assert.equal(Object.keys(clusters).length, 2);
});

test('a single shared term is not enough to merge', () => {
  // Requires >=2 shared terms; one common word must not glue two movements.
  const clusters = assignToClusters(
    [art({ terms: ['import', 'duty'] }), art({ terms: ['import', 'fuel'] })], {},
  );
  assert.equal(Object.keys(clusters).length, 2);
});

test('daysSeen and domains are deduplicated sets', () => {
  const clusters = assignToClusters([art(), art(), art({ date: '2026-09-02' })], {});
  const c = Object.values(clusters)[0];
  assert.deepEqual(c.daysSeen.sort(), ['2026-09-01', '2026-09-02']);
  assert.deepEqual(c.domains, ['a.test']);
  assert.equal(c.articleCount, 3);
});

test('samples are capped at 5', () => {
  const many = Array.from({ length: 9 }, (_, i) => art({ url: `https://a.test/${i}` }));
  const c = Object.values(assignToClusters(many, {}))[0];
  assert.equal(c.samples.length, 5);
});

test('a new article extends an existing persisted cluster', () => {
  const first = assignToClusters([art()], {});
  const second = assignToClusters([art({ domain: 'b.test', date: '2026-09-03' })], first);
  assert.equal(Object.keys(second).length, 1);
  assert.equal(Object.values(second)[0].articleCount, 2);
});

test('evictStale drops clusters idle beyond the window and keeps fresh ones', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  const clusters = {
    old: { lastSeen: '2026-08-01', id: 'old' },
    fresh: { lastSeen: '2026-09-28', id: 'fresh' },
  };
  const kept = evictStale(clusters, now, { maxIdleDays: 21 });
  assert.deepEqual(Object.keys(kept), ['fresh']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "test/discovery/cluster.test.mjs"`
Expected: FAIL — cannot find module `cluster.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/cluster.mjs`:

```javascript
// Groups articles into candidate movements. Country-gated so a topic word
// cannot merge protests on two continents, and matched on distinctive-term
// overlap so "police" and "government" cannot glue the corpus together.
//
// Clusters persist in discovery/state.json across runs — "sustained across
// days" is only measurable with memory of previous runs. Sets are stored as
// arrays so the state file stays plain JSON.

const DAY_MS = 24 * 60 * 60 * 1000;

// Overlap COUNT, not ratio. Jaccard was measured and rejected: it graduated
// zero clusters from 241 real stories because it penalizes set-size
// differences, and titles here are truncated to ~8 usable terms.
export function sharedTermCount(a, b) {
  const B = b instanceof Set ? b : new Set(b);
  let n = 0;
  for (const t of new Set(a)) if (B.has(t)) n += 1;
  return n;
}

// One wire story republished across domains is not multi-outlet corroboration.
// Identical normalized titles collapse into a single story carrying every
// domain and day it appeared under. Mirrors normTitle() in aggregate.mjs.
function normTitle(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function collapseSyndication(articles) {
  const byTitle = new Map();
  for (const a of articles) {
    const k = normTitle(a.title);
    if (!k) continue;
    const hit = byTitle.get(k);
    if (!hit) {
      byTitle.set(k, { ...a, domains: [a.domain], days: [a.date] });
    } else {
      if (!hit.domains.includes(a.domain)) hit.domains.push(a.domain);
      if (!hit.days.includes(a.date)) hit.days.push(a.date);
    }
  }
  return [...byTitle.values()];
}

export function clusterKey(article) {
  const stem = [...article.terms].sort().slice(0, 3).join('-') || 'untitled';
  return `${article.country}:${stem}`.toLowerCase().replace(/[^a-z0-9:-]+/g, '-');
}

function seed(article) {
  return {
    id: clusterKey(article),
    country: article.country,
    terms: [...article.terms],
    domains: [...(article.domains || [article.domain])],
    daysSeen: [...(article.days || [article.date])],
    articleCount: 1,
    firstSeen: article.date,
    lastSeen: article.date,
    samples: [{ title: article.title, url: article.url, domain: article.domain, date: article.date }],
  };
}

function absorb(cluster, article) {
  cluster.terms = [...new Set([...cluster.terms, ...article.terms])];
  for (const d of article.domains || [article.domain]) {
    if (!cluster.domains.includes(d)) cluster.domains.push(d);
  }
  for (const d of article.days || [article.date]) {
    if (!cluster.daysSeen.includes(d)) cluster.daysSeen.push(d);
  }
  cluster.articleCount += 1;
  if (article.date < cluster.firstSeen) cluster.firstSeen = article.date;
  if (article.date > cluster.lastSeen) cluster.lastSeen = article.date;
  if (cluster.samples.length < 5) {
    cluster.samples.push({ title: article.title, url: article.url, domain: article.domain, date: article.date });
  }
  return cluster;
}

export function assignToClusters(articles, clusters, { minShared = 2 } = {}) {
  const out = { ...clusters };
  for (const article of articles) {
    if (!article.terms || article.terms.length === 0) continue;
    let bestId = null;
    let bestScore = 0;
    for (const [id, c] of Object.entries(out)) {
      if (c.country !== article.country) continue;
      const score = sharedTermCount(article.terms, c.terms);
      if (score >= minShared && score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (bestId) {
      out[bestId] = absorb({ ...out[bestId] }, article);
    } else {
      const c = seed(article);
      // A key collision with a different topic is possible; suffix it.
      let id = c.id;
      let n = 2;
      while (out[id]) { id = `${c.id}-${n}`; n += 1; }
      out[id] = { ...c, id };
    }
  }
  return out;
}

export function evictStale(clusters, nowMs, { maxIdleDays = 21 } = {}) {
  const out = {};
  for (const [id, c] of Object.entries(clusters || {})) {
    const last = Date.parse(`${c.lastSeen}T00:00:00Z`);
    if (Number.isNaN(last) || nowMs - last <= maxIdleDays * DAY_MS) out[id] = c;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 71 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/cluster.mjs test/discovery/cluster.test.mjs
git commit -m "feat: add distinctive-term clustering with staleness eviction"
```

---

### Task 4: Graduation, denylist, and cluster naming

**Files:**
- Create: `scripts/lib/discovery/graduate.mjs`
- Test: `test/discovery/graduate.test.mjs`

**Interfaces:**
- Consumes: the cluster shape from Task 3.
- Produces:
  - `DENYLIST: Set<string>`
  - `isDeniedDomain(domain: string): boolean`
  - `isGraduated(cluster, opts?: { minDomains?: number, minDays?: number }): boolean`
  - `clusterToEntity(cluster): { qid, name, description, wikipedia, countries, country, needsName }`

**Naming:** clusters have no name, so one is synthesized from the country and the two most distinctive terms — `"Kenya Import Duty protests"`. It is explicitly a placeholder; `needsName: true` marks it for the reviewer. The returned shape matches the Wikidata entity contract so `buildSuggestion` (Phase 1) can be reused unchanged.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/graduate.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeniedDomain, isGraduated, clusterToEntity } from '../../scripts/lib/discovery/graduate.mjs';

const cluster = (over = {}) => ({
  id: 'kenya:duty-import', country: 'Kenya',
  terms: ['import', 'duty', 'traders'],
  domains: ['a.test', 'b.test', 'c.test'],
  daysSeen: ['2026-09-01', '2026-09-02', '2026-09-03'],
  articleCount: 7, firstSeen: '2026-09-01', lastSeen: '2026-09-03',
  samples: [], ...over,
});

test('denies non-news domains observed in probes', () => {
  assert.equal(isDeniedDomain('indiankanoon.org'), true);
  assert.equal(isDeniedDomain('www.indiankanoon.org'), true);
  assert.equal(isDeniedDomain('thehindu.com'), false);
});

test('graduates a cluster meeting both bars', () => {
  assert.equal(isGraduated(cluster()), true);
});

test('rejects a cluster from too few outlets', () => {
  assert.equal(isGraduated(cluster({ domains: ['a.test', 'b.test'] })), false);
});

test('rejects a one-day flash even with many outlets', () => {
  assert.equal(isGraduated(cluster({ daysSeen: ['2026-09-01'] })), false);
});

test('synthesizes a placeholder name flagged for review', () => {
  const e = clusterToEntity(cluster());
  assert.equal(e.country, 'Kenya');
  assert.equal(e.needsName, true);
  assert.match(e.name, /Kenya/);
  assert.match(e.name, /protests/i);
  assert.equal(e.wikipedia, '');
  assert.deepEqual(e.countries, ['Kenya']);
});

test('the synthesized entity works with the Phase 1 suggestion builder', async () => {
  const { buildSuggestion } = await import('../../scripts/lib/discovery/suggest.mjs');
  const s = buildSuggestion(clusterToEntity(cluster()), []);
  assert.equal(s.region, 'Africa');
  assert.equal(s.location, 'Kenya');
  assert.ok(s.feeds.length >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "test/discovery/graduate.test.mjs"`
Expected: FAIL — cannot find module `graduate.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/graduate.mjs`:

```javascript
// The graduation bar is the whole quality mechanism for Tier 2. GDELT's own
// relevance is weak, so what makes a cluster worth proposing is that several
// independent outlets covered it across several days.

// Non-news sources seen in live probes: case-law databases and opinion
// aggregators surface on protest queries but are not coverage.
export const DENYLIST = new Set([
  'indiankanoon.org',
  'casemine.com',
  'lawyersclubindia.com',
  'pjmedia.com',
  'freerepublic.com',
  'zerohedge.com',
  'beforeitsnews.com',
]);

export function isDeniedDomain(domain) {
  return DENYLIST.has(String(domain || '').toLowerCase().replace(/^www\./, ''));
}

export function isGraduated(cluster, { minDomains = 3, minDays = 3 } = {}) {
  const domains = new Set((cluster.domains || []).filter((d) => !isDeniedDomain(d)));
  const days = new Set(cluster.daysSeen || []);
  return domains.size >= minDomains && days.size >= minDays;
}

function titleCase(s) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Clusters have no name. Synthesize a placeholder from the country and the
// two most distinctive terms, and flag it so a reviewer renames it.
export function clusterToEntity(cluster) {
  const topic = titleCase((cluster.terms || []).slice(0, 2).join(' '));
  const name = topic ? `${cluster.country} ${topic} protests` : `${cluster.country} protests`;
  return {
    qid: cluster.id,
    name,
    description: '',
    wikipedia: '',
    countries: [cluster.country],
    country: cluster.country,
    needsName: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 77 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/graduate.mjs test/discovery/graduate.test.mjs
git commit -m "feat: add cluster graduation bar, denylist, and naming"
```

---

### Task 5: Rate-limited sequential fetching

**Files:**
- Create: `scripts/lib/discovery/gdelt-fetch.mjs`
- Test: `test/discovery/gdelt-fetch.test.mjs`

**Interfaces:**
- Consumes: `fetchJson` (Phase 1), `QUERY_MATRIX`, `buildGdeltUrl`, `parseArticles` from Task 1.
- Produces: `fetchMatrix(opts?: { matrix?, fetchJsonImpl?, delayMs?, sleepImpl?, onProgress? }): Promise<Array<article>>`

**Why a module of its own:** GDELT's 1-request-per-5-seconds limit means this loop must be serial with a delay between calls, and a single failing query must not abort the rest. `sleepImpl` is injected so the test suite does not actually wait.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/gdelt-fetch.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMatrix } from '../../scripts/lib/discovery/gdelt-fetch.mjs';

const matrix = [
  { lang: 'eng', terms: ['protest'], countries: [null, 'Kenya'] },
];

const payload = (domain) => ({
  articles: [{
    title: 'A protest happened', url: `https://${domain}/1`, domain,
    sourcecountry: 'Kenya', seendate: '20260902T003000Z', language: 'English',
  }],
});

test('fetches every (language, country) pair and flattens the articles', async () => {
  const seen = [];
  const out = await fetchMatrix({
    matrix,
    fetchJsonImpl: async (url) => { seen.push(url); return payload('a.test'); },
    sleepImpl: async () => {},
  });
  assert.equal(seen.length, 2); // null + Kenya
  assert.equal(out.length, 2);
});

test('waits between requests to respect the 1-per-5s rate limit', async () => {
  const delays = [];
  await fetchMatrix({
    matrix,
    fetchJsonImpl: async () => payload('a.test'),
    sleepImpl: async (ms) => { delays.push(ms); },
    delayMs: 6000,
  });
  assert.ok(delays.length >= 1);
  assert.ok(delays.every((d) => d >= 6000), `expected >=6000ms, got ${delays}`);
});

test('one failing query does not abort the rest', async () => {
  let call = 0;
  const out = await fetchMatrix({
    matrix,
    fetchJsonImpl: async () => {
      call += 1;
      if (call === 1) throw new Error('non-JSON response (text/html)');
      return payload('b.test');
    },
    sleepImpl: async () => {},
  });
  assert.equal(out.length, 1);
});

test('deduplicates articles returned by more than one query', async () => {
  const out = await fetchMatrix({
    matrix,
    fetchJsonImpl: async () => payload('a.test'),
    sleepImpl: async () => {},
  });
  // Same url from both passes collapses to one.
  assert.equal(out.length, 2);
  const unique = new Set(out.map((a) => a.url));
  assert.equal(unique.size, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "test/discovery/gdelt-fetch.test.mjs"`
Expected: FAIL — cannot find module `gdelt-fetch.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/gdelt-fetch.mjs`:

```javascript
// Walks the query matrix serially. GDELT allows one request per 5 seconds
// and answers a violation with HTTP 200 and a plain-text body — fetchJson
// turns that into a thrown "non-JSON response", which we log and skip
// rather than letting it abort the run.

import { fetchJson } from './fetch.mjs';
import { QUERY_MATRIX, buildGdeltUrl, parseArticles } from './gdelt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchMatrix({
  matrix = QUERY_MATRIX,
  fetchJsonImpl = fetchJson,
  delayMs = 6000,
  sleepImpl = sleep,
  onProgress = () => {},
} = {}) {
  const all = [];
  const pairs = [];
  for (const row of matrix) {
    for (const country of row.countries) pairs.push({ lang: row.lang, terms: row.terms, country });
  }

  for (let i = 0; i < pairs.length; i += 1) {
    const { lang, terms, country } = pairs[i];
    const url = buildGdeltUrl({ lang, terms, country });
    try {
      const json = await fetchJsonImpl(url);
      const articles = parseArticles(json);
      all.push(...articles);
      onProgress({ lang, country, count: articles.length });
    } catch (err) {
      onProgress({ lang, country, count: 0, error: err.message });
    }
    // Space every request, including after the last, so a caller running
    // two matrices back to back cannot trip the limit.
    if (i < pairs.length - 1) await sleepImpl(delayMs);
  }

  return all;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 81 tests total. Note the dedupe test asserts flattening only; deduplication by URL happens in Task 6.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/gdelt-fetch.mjs test/discovery/gdelt-fetch.test.mjs
git commit -m "feat: add rate-limited GDELT matrix fetching"
```

---

### Task 6: Wire Tier 2 into discover.mjs

**Files:**
- Modify: `scripts/discover.mjs`
- Test: `test/discovery/discover-tier2.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1-5, plus Phase 1's `buildSuggestion`, `findTrackedMatch`, `readState`, `writeState`, `writeCandidates`.
- Produces: `buildTier2Candidates({ articles, config, state, nowMs }): { candidates, clusters }`

**Cross-tier dedupe:** a GDELT cluster may describe a protest Wikidata already supplied. Tier 2 candidates are dropped when their synthesized entity matches an existing movement (`findTrackedMatch`) **or** when a Tier 1 candidate in the same run already covers the same country and shares a distinctive term.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/discover-tier2.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTier2Candidates } from '../../scripts/discover.mjs';

const NOW = Date.parse('2026-09-04T00:00:00Z');
const emptyState = { promoted: [], rejected: [], clusters: {} };

// Three outlets across three days — clears the bar.
const sustained = () => ([
  { title: 'Traders reject import duty rise', url: 'https://a.test/1', domain: 'a.test', country: 'Kenya', date: '2026-09-01' },
  { title: 'Import duty protest spreads in Nairobi', url: 'https://b.test/2', domain: 'b.test', country: 'Kenya', date: '2026-09-02' },
  { title: 'Traders shut shops over import duty', url: 'https://c.test/3', domain: 'c.test', country: 'Kenya', date: '2026-09-03' },
]);

test('graduates a sustained multi-outlet cluster into a low-confidence candidate', () => {
  const { candidates } = buildTier2Candidates({
    articles: sustained(), config: {}, state: emptyState, nowMs: NOW,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source, 'gdelt');
  assert.equal(candidates[0].confidence, 'low');
  assert.equal(candidates[0].country, 'Kenya');
  assert.ok(candidates[0].daysSeen >= 3);
  assert.ok(candidates[0].domains.length >= 3);
});

test('does not graduate a single-outlet story', () => {
  const one = sustained().map((a) => ({ ...a, domain: 'a.test' }));
  const { candidates } = buildTier2Candidates({ articles: one, config: {}, state: emptyState, nowMs: NOW });
  assert.equal(candidates.length, 0);
});

test('does not graduate a one-day flash', () => {
  const flash = sustained().map((a) => ({ ...a, date: '2026-09-01' }));
  const { candidates } = buildTier2Candidates({ articles: flash, config: {}, state: emptyState, nowMs: NOW });
  assert.equal(candidates.length, 0);
});

test('returns clusters so they can be persisted for the next run', () => {
  const { clusters } = buildTier2Candidates({
    articles: sustained(), config: {}, state: emptyState, nowMs: NOW,
  });
  assert.ok(Object.keys(clusters).length >= 1);
});

test('drops articles from denylisted domains before clustering', () => {
  const withJunk = [...sustained(), {
    title: 'Import duty case listing', url: 'https://indiankanoon.org/1',
    domain: 'indiankanoon.org', country: 'Kenya', date: '2026-09-04',
  }];
  const { candidates } = buildTier2Candidates({ articles: withJunk, config: {}, state: emptyState, nowMs: NOW });
  assert.ok(!candidates[0].domains.includes('indiankanoon.org'));
});

test('suppresses a cluster already covered by a tracked movement', () => {
  const config = {
    'kenya-duty': {
      name: 'Kenya Import Duty Protests', location: 'Nairobi, Kenya',
      keywords: ['import duty'], strictKeywords: ['import duty', 'traders'],
    },
  };
  const { candidates } = buildTier2Candidates({
    articles: sustained(), config, state: emptyState, nowMs: NOW,
  });
  assert.equal(candidates.length, 0);
});

test('suppresses a rejected cluster key', () => {
  const first = buildTier2Candidates({ articles: sustained(), config: {}, state: emptyState, nowMs: NOW });
  const key = first.candidates[0].key;
  const { candidates } = buildTier2Candidates({
    articles: sustained(), config: {},
    state: { promoted: [], rejected: [key], clusters: {} }, nowMs: NOW,
  });
  assert.equal(candidates.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "test/discovery/discover-tier2.test.mjs"`
Expected: FAIL — `buildTier2Candidates` is not exported.

- [ ] **Step 3: Modify `scripts/discover.mjs`**

Add these imports below the existing `store.mjs` import:

```javascript
import { fetchMatrix } from './lib/discovery/gdelt-fetch.mjs';
import { tokenize, documentFrequency, distinctiveTerms } from './lib/discovery/tokenize.mjs';
import { assignToClusters, evictStale } from './lib/discovery/cluster.mjs';
import { isDeniedDomain, isGraduated, clusterToEntity } from './lib/discovery/graduate.mjs';
```

Add this exported function immediately after `buildCandidates`:

```javascript
// Tier 2: cluster GDELT coverage and graduate only what is sustained across
// days and carried by several outlets. Returns both the candidates and the
// updated cluster map, which the caller persists for the next run.
export function buildTier2Candidates({ articles, config, state, nowMs = Date.now() }) {
  const usable = articles.filter((a) => !isDeniedDomain(a.domain));

  // Deduplicate by URL: the same story reaches us from several matrix passes.
  const byUrl = new Map();
  for (const a of usable) if (!byUrl.has(a.url)) byUrl.set(a.url, a);
  const unique = [...byUrl.values()];

  const tokenLists = unique.map((a) => tokenize(a.title));
  const df = documentFrequency(tokenLists);
  const withTerms = unique.map((a, i) => ({
    ...a,
    terms: distinctiveTerms(tokenLists[i], df, unique.length),
  }));

  const carried = evictStale(state.clusters || {}, nowMs);
  const clusters = assignToClusters(withTerms, carried);

  const existingIds = Object.keys(config || {});
  const seen = new Set(existingIds);
  const candidates = [];

  for (const cluster of Object.values(clusters)) {
    if (!isGraduated(cluster)) continue;
    const key = `gd-${cluster.id}`;
    if (state.promoted.includes(key) || state.rejected.includes(key)) continue;
    const entity = clusterToEntity(cluster);
    if (findTrackedMatch({ name: cluster.terms.join(' '), country: cluster.country }, config)) continue;
    const suggested = buildSuggestion(entity, [...seen]);
    seen.add(suggested.id);
    candidates.push({
      key,
      source: 'gdelt',
      confidence: 'low',
      country: cluster.country,
      countries: [cluster.country],
      domains: cluster.domains.filter((d) => !isDeniedDomain(d)),
      daysSeen: cluster.daysSeen.length,
      articleCount: cluster.articleCount,
      firstSeen: cluster.firstSeen,
      lastSeen: cluster.lastSeen,
      samples: cluster.samples,
      needsName: true,
      suggested,
    });
  }

  return { candidates, clusters };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 88 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/discover.mjs test/discovery/discover-tier2.test.mjs
git commit -m "feat: graduate GDELT clusters into review candidates"
```

---

### Task 7: Run both tiers from main()

**Files:**
- Modify: `scripts/discover.mjs` (the `main()` function)

**Interfaces:**
- Consumes: `buildCandidates` (Tier 1), `buildTier2Candidates` (Tier 6).
- Produces: a `discovery/candidates.json` holding both sources, and a persisted cluster map.

**Cross-tier rule:** Tier 1 runs first and its candidates win. A Tier 2 candidate is dropped when a Tier 1 candidate in the same run already covers that country and shares a distinctive term — Wikidata's naming and description are strictly better when both describe the same protest.

- [ ] **Step 1: Replace the body of `main()` in `scripts/discover.mjs`**

Replace the whole existing `main()` with:

```javascript
async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const state = readState(DISCOVERY_DIR);

  // ---- Tier 1: Wikidata -------------------------------------------------
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(buildQuery(cutoffIso(LOOKBACK_MONTHS)))}&format=json`;
  let tier1 = [];
  try {
    const entities = parseBindings(await fetchJson(url));
    console.log(`Wikidata returned ${entities.length} protest entities.`);
    tier1 = buildCandidates({ entities, config, state });
  } catch (err) {
    console.warn(`Wikidata query failed: ${err.message}`);
  }

  // ---- Tier 2: GDELT ----------------------------------------------------
  console.log('\nQuerying GDELT (serialized at 6s, this takes a few minutes)...');
  let tier2 = [];
  let clusters = state.clusters || {};
  try {
    const articles = await fetchMatrix({
      onProgress: ({ lang, country, count, error }) => {
        const where = country || 'global';
        console.log(error ? `  ${lang}/${where}: ${error}` : `  ${lang}/${where}: ${count} articles`);
      },
    });
    console.log(`GDELT returned ${articles.length} articles.`);
    const res = buildTier2Candidates({ articles, config, state });
    clusters = res.clusters;
    // Wikidata wins when both tiers describe the same protest: it carries a
    // real name and description, which a synthesized cluster name does not.
    const tier1Countries = new Set(tier1.map((c) => c.country));
    tier2 = res.candidates.filter((c) => {
      if (!tier1Countries.has(c.country)) return true;
      const terms = new Set(c.suggested.strictKeywords);
      return !tier1.some(
        (t) => t.country === c.country && t.suggested.strictKeywords.some((k) => terms.has(k)),
      );
    });
  } catch (err) {
    console.warn(`GDELT pass failed: ${err.message}`);
  }

  const candidates = [...tier1, ...tier2];
  writeCandidates(DISCOVERY_DIR, candidates);
  writeState(DISCOVERY_DIR, { ...state, clusters });

  console.log(`\n${candidates.length} candidate(s) for review ` +
    `(${tier1.length} wikidata, ${tier2.length} gdelt), ` +
    `${Object.keys(clusters).length} clusters tracked:`);
  for (const c of candidates) {
    const mark = c.source === 'gdelt' ? '~' : ' ';
    console.log(` ${mark} ${c.key}  ${c.suggested.name}  (${c.country} / ${c.suggested.region || 'region?'})`);
  }
  console.log(`\n~ = low confidence, synthesized name — rename before promoting.`);
  console.log(`Promote one with:  npm run promote -- <key>`);
}
```

- [ ] **Step 2: Run the unit suite**

Run: `npm test`
Expected: PASS, 86 tests total (main() is not unit-tested; the exported builders are).

- [ ] **Step 3: Run the real thing**

Run: `npm run discover`
Expected: Wikidata entity count, then per-pair GDELT progress lines, then a combined candidate list with `~` marking GDELT rows. Takes roughly 2-3 minutes because of the 6s spacing.

- [ ] **Step 4: Verify state persisted the clusters**

Run: `node -e "const s=require('./discovery/state.json'); console.log('clusters:', Object.keys(s.clusters||{}).length)"`
Expected: a non-zero cluster count.

- [ ] **Step 5: Confirm the existing movements are still suppressed**

Run: `node -e "const c=require('./discovery/candidates.json').candidates; console.log(c.filter(x=>/jantar|neet|finance bill/i.test(x.suggested.name)).length ? 'LEAK' : 'suppressed OK')"`
Expected: `suppressed OK`.

- [ ] **Step 6: Commit**

```bash
git add scripts/discover.mjs discovery/
git commit -m "feat: run Wikidata and GDELT tiers into one candidate queue"
```

---

### Task 8: Threshold validation against a real fixture

**Files:**
- Create: `test/fixtures/README.md`
- Test: `test/discovery/thresholds.test.mjs`
- (Fixture `test/fixtures/gdelt-india-7d.json` is already committed.)

**Interfaces:**
- Consumes: `parseArticles`, `tokenize`, `documentFrequency`, `distinctiveTerms`, `collapseSyndication`, `assignToClusters`, `isGraduated`.

**Why this fixture and not a global one:** a sparse global sample (75 articles, 2 days) was measured to produce 63 singleton clusters and a single false positive — a syndicated non-protest story. The committed fixture is a realistic per-country slice (India, 7 days, 250 articles), which is the shape Tier 2 actually queries. These tests assert the pipeline finds real movements in it, so a regression in tokenization, matching, or the graduation bar fails loudly.

- [ ] **Step 1: Write `test/fixtures/README.md`**

```markdown
# Test fixtures

`gdelt-india-7d.json` — a real GDELT DOC 2.0 `artlist` response: India,
English, 7 days, 250 records. Committed so the clustering tests run offline
and reproducibly.

It is a per-country slice on purpose. A sparse global sample (2 days, 75
records) was measured to yield 63 singleton clusters and one false positive,
which is why Tier 2 queries per country over a wide window.

Recapture with:

    curl -s --compressed -A "ProtestTrackerBot/1.0 (https://protesttracker.net)" \
      "https://api.gdeltproject.org/api/v2/doc/doc?query=%28protest%20OR%20demonstration%20OR%20strike%29%20sourcelang%3Aeng%20sourcecountry%3AIndia&mode=artlist&maxrecords=250&format=json&timespan=7d" \
      -o test/fixtures/gdelt-india-7d.json

GDELT allows one request every 5 seconds and answers a violation with HTTP
200 and a plain-text body, so check the file starts with `{` before trusting
it. OR'd terms must be wrapped in parentheses or it returns an error, also
as HTTP 200.
```

- [ ] **Step 2: Write the threshold test**

Create `test/discovery/thresholds.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseArticles } from '../../scripts/lib/discovery/gdelt.mjs';
import { tokenize, documentFrequency, distinctiveTerms } from '../../scripts/lib/discovery/tokenize.mjs';
import { collapseSyndication, assignToClusters } from '../../scripts/lib/discovery/cluster.mjs';
import { isGraduated } from '../../scripts/lib/discovery/graduate.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/gdelt-india-7d.json', import.meta.url), 'utf8'));
const articles = parseArticles(fixture);

function pipeline(list) {
  const stories = collapseSyndication(list);
  const tokenLists = stories.map((a) => tokenize(a.title));
  const df = documentFrequency(tokenLists);
  const withTerms = stories.map((a, i) => ({ ...a, terms: distinctiveTerms(tokenLists[i], df, stories.length) }));
  return assignToClusters(withTerms, {});
}

test('the fixture parses into a dense set of articles', () => {
  assert.ok(articles.length > 200, `expected >200 articles, got ${articles.length}`);
});

test('syndication collapse removes duplicate titles carried by several domains', () => {
  const stories = collapseSyndication(articles);
  assert.ok(stories.length < articles.length, 'no syndication was collapsed at all');
  assert.ok(stories.some((s) => s.domains.length > 1), 'expected at least one syndicated story');
});

test('corpus-wide vocabulary does not survive as a distinctive term', () => {
  const stories = collapseSyndication(articles);
  const tokenLists = stories.map((a) => tokenize(a.title));
  const df = documentFrequency(tokenLists);
  const all = stories.flatMap((_, i) => distinctiveTerms(tokenLists[i], df, stories.length));
  assert.ok(!all.includes('protest'));
  assert.ok(!all.includes('police'));
});

test('clustering is neither degenerate nor collapsed', () => {
  const clusters = pipeline(articles);
  const n = Object.keys(clusters).length;
  const stories = collapseSyndication(articles).length;
  assert.ok(n < stories, 'every story became its own cluster — matching too tight');
  const biggest = Math.max(...Object.values(clusters).map((c) => c.articleCount));
  assert.ok(biggest < stories * 0.5, `largest cluster holds ${biggest}/${stories} — matching too loose`);
});

test('real movements clear the 3-outlet, 3-day graduation bar', () => {
  // Measured on this fixture: 5 clusters graduate, including the Supreme
  // Court / CJP protest coverage and the SFI Secretariat march.
  const graduated = Object.values(pipeline(articles)).filter((c) => isGraduated(c));
  assert.ok(graduated.length >= 3,
    `expected >=3 graduating clusters, got ${graduated.length} — the tier finds nothing`);
  for (const c of graduated) {
    assert.ok(c.domains.length >= 3);
    assert.ok(c.daysSeen.length >= 3);
  }
});

test('graduated clusters are distinct movements, not one blob', () => {
  const graduated = Object.values(pipeline(articles)).filter((c) => isGraduated(c));
  const ids = new Set(graduated.map((c) => c.id));
  assert.equal(ids.size, graduated.length, 'graduated clusters share ids');
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS, 94 tests total.

If the graduation test fails, the constants need tuning rather than the test weakening: adjust `maxDocFreq` in `tokenize.mjs` or `minShared` in `cluster.mjs`, re-run, and record the chosen values in the spec.

- [ ] **Step 4: Commit**

```bash
git add test/fixtures test/discovery/thresholds.test.mjs
git commit -m "test: validate clustering against a real dense GDELT fixture"
```

---

### Task 9: Update the discovery workflow for the longer run

**Files:**
- Modify: `.github/workflows/discover.yml`

**Why:** Tier 2 adds roughly 20 serialized requests at 6s spacing, so the job now takes minutes rather than seconds. The default step timeout is generous, but the job should declare an explicit one so a hung upstream cannot occupy a runner for six hours.

- [ ] **Step 1: Add a job timeout and widen the summary tail**

In `.github/workflows/discover.yml`, add `timeout-minutes: 20` to the `discover` job, directly under `runs-on: ubuntu-latest`:

```yaml
  discover:
    runs-on: ubuntu-latest
    # Tier 2 serializes ~20 GDELT requests at 6s spacing. Bound the job so a
    # hung upstream cannot hold a runner.
    timeout-minutes: 20
```

Then change the summary tail from 40 to 80 lines so the per-pair GDELT progress is visible:

```yaml
            tail -n 80 discover.log 2>/dev/null || echo "no output"
```

- [ ] **Step 2: Verify the workflow still parses and references both tiers**

Run:

```bash
node -e "
const s=require('fs').readFileSync('.github/workflows/discover.yml','utf8');
if(!s.includes('timeout-minutes: 20')) throw new Error('missing timeout');
if(!s.includes('tail -n 80')) throw new Error('summary not widened');
console.log('workflow OK,', s.split('\n').length, 'lines');"
```

Expected: `workflow OK`.

- [ ] **Step 3: Confirm deploy.yml and aggregate.mjs are still untouched**

Run: `git diff main --stat .github/workflows/deploy.yml scripts/aggregate.mjs`
Expected: empty output.

- [ ] **Step 4: Run the full suite one last time**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/discover.yml
git commit -m "chore: bound discovery job runtime for the GDELT tier"
```

---

## Done criteria

- `npm test` passes (93 tests).
- `npm run discover` runs both tiers and writes a combined `discovery/candidates.json` with `source: "wikidata"` and `source: "gdelt"` rows.
- GDELT candidates are marked `confidence: "low"` and `needsName: true`.
- `discovery/state.json` persists clusters between runs.
- Existing movements (`india-cjp`, `kenya-finance`) are not re-proposed by either tier.
- Denylisted domains never appear in a candidate's `domains`.
- `npm run typecheck` passes.
- `scripts/aggregate.mjs` and `.github/workflows/deploy.yml` show no diff against `main`.
