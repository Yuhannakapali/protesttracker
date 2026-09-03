# Protest Discovery Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover notable protest movements worldwide from Wikidata each day and queue them as reviewable candidates that can be promoted into `movements.config.json` with one command.

**Architecture:** A standalone `scripts/discover.mjs` queries the Wikidata SPARQL endpoint for protest entities with a recent start date, normalizes them, suppresses ones already tracked/promoted/rejected, and writes `discovery/candidates.json`. A separate `scripts/promote.mjs` turns a candidate into a config block. Pure logic lives in small single-responsibility modules under `scripts/lib/discovery/` so it is testable without network access. `scripts/aggregate.mjs` and `.github/workflows/deploy.yml` are not modified.

**Tech Stack:** Node 20+ built-ins only (`fetch`, `node:fs`, `node:test`, `node:assert`). No npm dependencies. ES modules (`.mjs`), matching the existing scripts.

**Spec:** `docs/superpowers/specs/2026-09-04-protest-discovery-design.md`

## Global Constraints

- **No new npm dependencies.** Node built-ins only. The repo's `dependencies` are `next`, `react`, `react-dom` and must stay that way.
- **ES modules, `.mjs`,** matching `scripts/aggregate.mjs`.
- **Never modify `scripts/aggregate.mjs` or `.github/workflows/deploy.yml`.**
- **State lives in `discovery/`, never `public/data/`** — `public/` is served publicly and must not expose unreviewed clusters.
- **Wikidata requires a descriptive User-Agent:** `ProtestTrackerBot/1.0 (https://protesttracker.net)`.
- **Region strings must match existing data exactly:** `Africa`, `Americas`, `Asia`, plus new `Europe`, `Middle East`, `Oceania`. `lib/regions.ts` derives the list from data, so no UI change is needed.
- **Nothing is published automatically.** `discover.mjs` writes only to `discovery/`; only `promote.mjs` touches `movements.config.json`, and only when a human runs it.
- **JSON files are written with 2-space indent and a trailing newline,** matching `writeJson` in `aggregate.mjs`.
- Commit messages use conventional prefixes (`feat:`, `test:`, `chore:`). No `Co-Authored-By` trailer, no tool attribution.

---

## File Structure

| Path | Responsibility |
|---|---|
| `scripts/lib/discovery/countries.mjs` | One country table → region + ISO2. Pure. |
| `scripts/lib/discovery/fetch.mjs` | `fetchJson` — UA, timeout, non-JSON detection. Only networked module. |
| `scripts/lib/discovery/wikidata.mjs` | Build SPARQL query; normalize bindings. Pure. |
| `scripts/lib/discovery/suggest.mjs` | Slug/id, Google News feed URLs, suggestion block. Pure. |
| `scripts/lib/discovery/suppress.mjs` | Already-tracked / promoted / rejected checks. Pure. |
| `scripts/lib/discovery/store.mjs` | Read/write `discovery/state.json` + `candidates.json`. |
| `scripts/discover.mjs` | Orchestration entry point. |
| `scripts/promote.mjs` | Candidate → config block; `--reject`, `--with-background`. |
| `scripts/lib/discovery/background.mjs` | Wikipedia lead → `BackgroundBlock[]` + CC BY-SA attribution. |
| `test/discovery/*.test.mjs` | `node --test` suites. |
| `.github/workflows/discover.yml` | Daily CI. |

---

### Task 1: Test harness and country table

**Files:**
- Modify: `package.json` (scripts block)
- Create: `scripts/lib/discovery/countries.mjs`
- Test: `test/discovery/countries.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `countryToRegion(country: string): string` (empty string when unknown); `countryToIso2(country: string): string` (empty string when unknown).

- [ ] **Step 1: Write the failing test**

Create `test/discovery/countries.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryToRegion, countryToIso2 } from '../../scripts/lib/discovery/countries.mjs';

test('maps countries to the region strings already used in movements.json', () => {
  assert.equal(countryToRegion('Kenya'), 'Africa');
  assert.equal(countryToRegion('India'), 'Asia');
  assert.equal(countryToRegion('Chile'), 'Americas');
  assert.equal(countryToRegion('Spain'), 'Europe');
});

test('covers regions not yet present in the data', () => {
  assert.equal(countryToRegion('Iraq'), 'Middle East');
  assert.equal(countryToRegion('Australia'), 'Oceania');
});

test('returns empty string for unknown countries rather than guessing', () => {
  assert.equal(countryToRegion('Atlantis'), '');
  assert.equal(countryToIso2('Atlantis'), '');
});

test('maps countries to ISO2 codes for Google News locale params', () => {
  assert.equal(countryToIso2('Indonesia'), 'ID');
  assert.equal(countryToIso2('Nigeria'), 'NG');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/countries.test.mjs`
Expected: FAIL — cannot find module `countries.mjs`.

- [ ] **Step 3: Add the test script to package.json**

In `package.json`, inside `"scripts"`, add these three entries alongside the existing ones (do not remove any existing script):

```json
    "test": "node --test test/",
    "discover": "node scripts/discover.mjs",
    "promote": "node scripts/promote.mjs"
```

- [ ] **Step 4: Write the implementation**

Create `scripts/lib/discovery/countries.mjs`:

```javascript
// One table, two uses: region grouping for movements.json and ISO2 codes for
// Google News locale parameters. Unknown countries return '' so a caller can
// leave the field blank for a human rather than guessing wrong.

const COUNTRIES = {
  // Africa
  Nigeria: ['Africa', 'NG'], Kenya: ['Africa', 'KE'], 'South Africa': ['Africa', 'ZA'],
  Uganda: ['Africa', 'UG'], Ghana: ['Africa', 'GH'], Ethiopia: ['Africa', 'ET'],
  Sudan: ['Africa', 'SD'], Senegal: ['Africa', 'SN'], "Côte d'Ivoire": ['Africa', 'CI'],
  Tanzania: ['Africa', 'TZ'], Zimbabwe: ['Africa', 'ZW'], Malawi: ['Africa', 'MW'],
  Cameroon: ['Africa', 'CM'], Mozambique: ['Africa', 'MZ'], Tunisia: ['Africa', 'TN'],
  Morocco: ['Africa', 'MA'], Algeria: ['Africa', 'DZ'], Egypt: ['Africa', 'EG'],
  // Americas
  'United States': ['Americas', 'US'], Canada: ['Americas', 'CA'], Mexico: ['Americas', 'MX'],
  Brazil: ['Americas', 'BR'], Argentina: ['Americas', 'AR'], Chile: ['Americas', 'CL'],
  Colombia: ['Americas', 'CO'], Peru: ['Americas', 'PE'], Bolivia: ['Americas', 'BO'],
  Ecuador: ['Americas', 'EC'], Venezuela: ['Americas', 'VE'], Panama: ['Americas', 'PA'],
  Guatemala: ['Americas', 'GT'], Haiti: ['Americas', 'HT'], Cuba: ['Americas', 'CU'],
  // Asia
  India: ['Asia', 'IN'], Pakistan: ['Asia', 'PK'], Bangladesh: ['Asia', 'BD'],
  Indonesia: ['Asia', 'ID'], Philippines: ['Asia', 'PH'], Thailand: ['Asia', 'TH'],
  Vietnam: ['Asia', 'VN'], Malaysia: ['Asia', 'MY'], Singapore: ['Asia', 'SG'],
  'Sri Lanka': ['Asia', 'LK'], Nepal: ['Asia', 'NP'], Myanmar: ['Asia', 'MM'],
  China: ['Asia', 'CN'], Japan: ['Asia', 'JP'], 'South Korea': ['Asia', 'KR'],
  Mongolia: ['Asia', 'MN'], Kazakhstan: ['Asia', 'KZ'], Maldives: ['Asia', 'MV'],
  // Europe
  Spain: ['Europe', 'ES'], France: ['Europe', 'FR'], Germany: ['Europe', 'DE'],
  Italy: ['Europe', 'IT'], Portugal: ['Europe', 'PT'], 'United Kingdom': ['Europe', 'GB'],
  Ireland: ['Europe', 'IE'], Netherlands: ['Europe', 'NL'], Belgium: ['Europe', 'BE'],
  Austria: ['Europe', 'AT'], Poland: ['Europe', 'PL'], Hungary: ['Europe', 'HU'],
  Greece: ['Europe', 'GR'], Serbia: ['Europe', 'RS'], Bulgaria: ['Europe', 'BG'],
  Romania: ['Europe', 'RO'], Albania: ['Europe', 'AL'], Georgia: ['Europe', 'GE'],
  Ukraine: ['Europe', 'UA'], Russia: ['Europe', 'RU'], Slovakia: ['Europe', 'SK'],
  // Middle East
  Iran: ['Middle East', 'IR'], Iraq: ['Middle East', 'IQ'], Israel: ['Middle East', 'IL'],
  Turkey: ['Middle East', 'TR'], Lebanon: ['Middle East', 'LB'], Syria: ['Middle East', 'SY'],
  Jordan: ['Middle East', 'JO'], 'Saudi Arabia': ['Middle East', 'SA'], Yemen: ['Middle East', 'YE'],
  // Oceania
  Australia: ['Oceania', 'AU'], 'New Zealand': ['Oceania', 'NZ'],
  'Papua New Guinea': ['Oceania', 'PG'], Fiji: ['Oceania', 'FJ'],
};

export function countryToRegion(country) {
  return COUNTRIES[String(country || '').trim()]?.[0] || '';
}

export function countryToIso2(country) {
  return COUNTRIES[String(country || '').trim()]?.[1] || '';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/lib/discovery/countries.mjs test/discovery/countries.test.mjs
git commit -m "test: add node --test harness and discovery country table"
```

---

### Task 2: Networked JSON fetch with non-JSON detection

**Files:**
- Create: `scripts/lib/discovery/fetch.mjs`
- Test: `test/discovery/fetch.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `fetchJson(url: string, opts?: { timeoutMs?: number, fetchImpl?: Function }): Promise<object>`. Throws `Error` on HTTP failure, timeout, or a non-JSON body.

**Why this exists:** GDELT answers rate-limit violations with HTTP 200 and a plain-text body, so `res.ok` is not sufficient. Phase 2 depends on this; Phase 1 uses the same guard for Wikidata. `fetchImpl` is injected so tests never hit the network.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/fetch.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../../scripts/lib/discovery/fetch.mjs';

const ok = (body, headers = { 'content-type': 'application/json' }) => async () => ({
  ok: true, status: 200,
  headers: { get: (k) => headers[k.toLowerCase()] || null },
  text: async () => body,
});

test('parses a JSON body', async () => {
  const out = await fetchJson('https://example.test/x', { fetchImpl: ok('{"a":1}') });
  assert.deepEqual(out, { a: 1 });
});

test('rejects a non-JSON body served with HTTP 200', async () => {
  // GDELT returns its rate-limit notice this way.
  const body = 'Please limit requests to one every 5 seconds';
  await assert.rejects(
    () => fetchJson('https://example.test/x', { fetchImpl: ok(body, { 'content-type': 'text/html' }) }),
    /non-JSON response/,
  );
});

test('rejects an HTTP error', async () => {
  const fail = async () => ({ ok: false, status: 503, headers: { get: () => null }, text: async () => '' });
  await assert.rejects(() => fetchJson('https://example.test/x', { fetchImpl: fail }), /HTTP 503/);
});

test('sends a descriptive User-Agent as Wikimedia policy requires', async () => {
  let seen = null;
  const spy = async (_url, init) => {
    seen = init.headers['User-Agent'];
    return (await ok('{}')());
  };
  await fetchJson('https://example.test/x', { fetchImpl: spy });
  assert.match(seen, /ProtestTrackerBot/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/fetch.test.mjs`
Expected: FAIL — cannot find module `fetch.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/fetch.mjs`:

```javascript
// The only module in discovery that touches the network. `fetchImpl` is
// injectable so every other module can be tested against fixtures.
//
// A JSON body is not implied by HTTP 200: GDELT answers a rate-limit
// violation with 200 and a plain-text notice, which JSON.parse would throw
// on with a message that hides the real cause. Detect it and say so.

export const USER_AGENT = 'ProtestTrackerBot/1.0 (https://protesttracker.net)';

export async function fetchJson(url, { timeoutMs = 30000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json, application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = await res.text();
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) {
      throw new Error(`non-JSON response (${type || 'no content-type'}) for ${url}: ${body.slice(0, 120)}`);
    }
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/fetch.mjs test/discovery/fetch.test.mjs
git commit -m "feat: add discovery JSON fetch with non-JSON body detection"
```

---

### Task 3: Wikidata query builder and binding normalizer

**Files:**
- Create: `scripts/lib/discovery/wikidata.mjs`
- Test: `test/discovery/wikidata.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildQuery(cutoffIso: string): string`
  - `SPARQL_ENDPOINT: string`
  - `parseBindings(json: object): Array<{ qid, name, description, wikipedia, countries: string[], country: string, needsName: boolean }>`

**Data notes (measured against the live endpoint):** `itemLabel` falls back to a bare Q-id when no label exists in the requested languages. `P17` is multi-valued — a solidarity protest returns one row per country, collapsed by `GROUP_CONCAT` into a comma-separated `countries` literal. `itemDescription` and `article` may be absent entirely.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/wikidata.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, parseBindings } from '../../scripts/lib/discovery/wikidata.mjs';

const binding = (over = {}) => ({
  item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q137860199' },
  itemLabel: { 'xml:lang': 'en', type: 'literal', value: '2026 Ugandan protests' },
  itemDescription: { 'xml:lang': 'en', type: 'literal', value: 'public demonstrations following election fraud' },
  article: { type: 'uri', value: 'https://en.wikipedia.org/wiki/2026_Ugandan_protests' },
  countries: { type: 'literal', value: 'Uganda' },
  ...over,
});

test('embeds the cutoff into the query', () => {
  const q = buildQuery('2025-03-01T00:00:00Z');
  assert.ok(q.includes('2025-03-01T00:00:00Z'));
  assert.ok(q.includes('wd:Q273120'));
});

test('normalizes a binding into a flat entity', () => {
  const [e] = parseBindings({ results: { bindings: [binding()] } });
  assert.equal(e.qid, 'Q137860199');
  assert.equal(e.name, '2026 Ugandan protests');
  assert.equal(e.description, 'public demonstrations following election fraud');
  assert.equal(e.wikipedia, 'https://en.wikipedia.org/wiki/2026_Ugandan_protests');
  assert.deepEqual(e.countries, ['Uganda']);
  assert.equal(e.country, 'Uganda');
  assert.equal(e.needsName, false);
});

test('splits a multi-country GROUP_CONCAT and takes the first as primary', () => {
  const [e] = parseBindings({
    results: { bindings: [binding({ countries: { type: 'literal', value: 'Bulgaria, Spain, Belgium' } })] },
  });
  assert.deepEqual(e.countries, ['Bulgaria', 'Spain', 'Belgium']);
  assert.equal(e.country, 'Bulgaria');
});

test('flags a bare Q-id label instead of dropping the entity', () => {
  const [e] = parseBindings({
    results: { bindings: [binding({ itemLabel: { type: 'literal', value: 'Q139760353' } })] },
  });
  assert.equal(e.needsName, true);
  assert.equal(e.name, 'Q139760353');
});

test('tolerates missing description and article', () => {
  const b = binding();
  delete b.itemDescription;
  delete b.article;
  const [e] = parseBindings({ results: { bindings: [b] } });
  assert.equal(e.description, '');
  assert.equal(e.wikipedia, '');
});

test('returns an empty array for a malformed payload', () => {
  assert.deepEqual(parseBindings({}), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/wikidata.test.mjs`
Expected: FAIL — cannot find module `wikidata.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/wikidata.mjs`:

```javascript
// Wikidata is the high-precision discovery tier: an item exists only because
// a human judged the protest notable enough to document, which is the
// sustained/multi-outlet bar already applied for us.

export const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// Q273120 = protest. P31/P279* walks subclasses; P580 = start time;
// P17 = country (multi-valued for solidarity protests abroad).
export function buildQuery(cutoffIso) {
  return `SELECT ?item ?itemLabel ?itemDescription ?article
       (GROUP_CONCAT(DISTINCT ?cl; separator=", ") AS ?countries) WHERE {
  ?item wdt:P31/wdt:P279* wd:Q273120 ; wdt:P580 ?start .
  FILTER(?start >= "${cutoffIso}"^^xsd:dateTime)
  OPTIONAL { ?item wdt:P17 ?c . ?c rdfs:label ?cl . FILTER(lang(?cl)="en") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,id,fr,pt,de,ar". }
} GROUP BY ?item ?itemLabel ?itemDescription ?article`;
}

const BARE_QID = /^Q\d+$/;

export function parseBindings(json) {
  const rows = json?.results?.bindings;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const qid = String(r.item?.value || '').split('/').pop() || '';
    const name = r.itemLabel?.value || qid;
    const countries = String(r.countries?.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      qid,
      name,
      description: r.itemDescription?.value || '',
      wikipedia: r.article?.value || '',
      countries,
      country: countries[0] || '',
      // A label the service could not resolve in any requested language comes
      // back as the Q-id itself. Keep the entity — a human can name it.
      needsName: BARE_QID.test(name),
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 14 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/wikidata.mjs test/discovery/wikidata.test.mjs
git commit -m "feat: add Wikidata protest query and binding normalizer"
```

---

### Task 4: Suggestion builder

**Files:**
- Create: `scripts/lib/discovery/suggest.mjs`
- Test: `test/discovery/suggest.test.mjs`

**Interfaces:**
- Consumes: `countryToRegion`, `countryToIso2` from Task 1; the entity shape from Task 3.
- Produces:
  - `slugify(text: string): string`
  - `buildId(name: string, country: string, existingIds: string[]): string`
  - `googleNewsFeed(query: string, iso2: string): string`
  - `buildSuggestion(entity, existingIds: string[]): object` — a `movements.config.json` block.

**Design note:** `location` is set to the country name only. Wikidata's `P17` gives a country and nothing finer; inventing a city would be a fabrication. Narrowing to "Nairobi, Kenya" is a review-time edit. `strictKeywords` is intentionally left thin — the spec accepts that statistical keywords are mediocre, and a human tightens them before the feed matters.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/suggest.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, buildId, googleNewsFeed, buildSuggestion } from '../../scripts/lib/discovery/suggest.mjs';

const entity = (over = {}) => ({
  qid: 'Q137860199',
  name: '2026 Ugandan protests',
  description: 'public demonstrations following election fraud',
  wikipedia: 'https://en.wikipedia.org/wiki/2026_Ugandan_protests',
  countries: ['Uganda'],
  country: 'Uganda',
  needsName: false,
  ...over,
});

test('slugify strips punctuation and years', () => {
  assert.equal(slugify('2026 Ugandan protests'), 'ugandan-protests');
  assert.equal(slugify('İzmir Meslek Fabrikası protests'), 'izmir-meslek-fabrikasi-protests');
});

test('buildId prefixes the country and dedupes against existing ids', () => {
  assert.equal(buildId('2026 Ugandan protests', 'Uganda', []), 'uganda-ugandan-protests');
  assert.equal(
    buildId('2026 Ugandan protests', 'Uganda', ['uganda-ugandan-protests']),
    'uganda-ugandan-protests-2',
  );
});

test('googleNewsFeed encodes the query and sets the country locale', () => {
  const url = googleNewsFeed('2026 Ugandan protests', 'UG');
  assert.ok(url.startsWith('https://news.google.com/rss/search?q='));
  assert.ok(url.includes('2026%20Ugandan%20protests'));
  assert.ok(url.includes('gl=UG'));
  assert.ok(url.includes('ceid=UG%3Aen'));
});

test('buildSuggestion produces a config block matching the movements.config.json shape', () => {
  const s = buildSuggestion(entity(), []);
  assert.equal(s.id, 'uganda-ugandan-protests');
  assert.equal(s.name, '2026 Ugandan protests');
  assert.equal(s.region, 'Africa');
  assert.equal(s.location, 'Uganda');
  assert.equal(s.year, 2026);
  assert.equal(s.description, 'public demonstrations following election fraud');
  assert.ok(Array.isArray(s.keywords) && s.keywords.length > 0);
  assert.ok(s.feeds.length >= 1);
  assert.equal(s.manualStatus, null);
});

test('year comes from the name when it carries one, else the current year', () => {
  assert.equal(buildSuggestion(entity(), []).year, 2026);
  const noYear = buildSuggestion(entity({ name: 'Flamingo Revolution' }), []).year;
  assert.equal(noYear, new Date().getFullYear());
});

test('an unknown country leaves region blank rather than guessing', () => {
  const s = buildSuggestion(entity({ country: 'Atlantis', countries: ['Atlantis'] }), []);
  assert.equal(s.region, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/suggest.test.mjs`
Expected: FAIL — cannot find module `suggest.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/suggest.mjs`:

```javascript
// Turns a normalized Wikidata entity into a draft movements.config.json
// block. Every field here is a starting point a human edits before the
// movement goes live — nothing produced by this module is authoritative.

import { countryToRegion, countryToIso2 } from './countries.mjs';

const DIACRITICS = /[\u0300-\u036f]/g;

export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    // Turkish dotless/dotted i survive NFD; fold them explicitly.
    .replace(/[ıİ]/g, 'i')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildId(name, country, existingIds = []) {
  const base = [slugify(country), slugify(name)].filter(Boolean).join('-') || 'movement';
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function googleNewsFeed(query, iso2) {
  const q = encodeURIComponent(query);
  if (!iso2) return `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=${encodeURIComponent('US:en')}`;
  return `https://news.google.com/rss/search?q=${q}&hl=en-${iso2}&gl=${iso2}&ceid=${encodeURIComponent(`${iso2}:en`)}`;
}

function yearFrom(name) {
  const m = String(name || '').match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : new Date().getFullYear();
}

// Distinctive words from the movement name, minus the generic protest
// vocabulary that would match any story anywhere.
const GENERIC = new Set([
  'protest', 'protests', 'demonstration', 'demonstrations', 'rally', 'rallies',
  'strike', 'strikes', 'march', 'marches', 'riot', 'riots', 'unrest', 'clashes',
  'the', 'of', 'in', 'at', 'and', 'against', 'a', 'to',
]);

function nameTerms(name) {
  return slugify(name)
    .split('-')
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

export function buildSuggestion(entity, existingIds = []) {
  const { name, country, description, qid, wikipedia } = entity;
  const iso2 = countryToIso2(country);
  const terms = nameTerms(name);
  return {
    id: buildId(name, country, existingIds),
    name,
    region: countryToRegion(country),
    location: country,
    year: yearFrom(name),
    description,
    // Broad list for Google News queries.
    keywords: [...new Set([...terms, country.toLowerCase(), 'protest'])].filter(Boolean),
    // Deliberately thin: a human tightens this before it filters anything.
    strictKeywords: [...new Set(terms)],
    feeds: [googleNewsFeed(name, iso2), googleNewsFeed(`${country} protest`, iso2)],
    manualStatus: null,
    // Provenance, stripped by promote.mjs before writing the config.
    _source: { wikidata: qid, wikipedia },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 20 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/suggest.mjs test/discovery/suggest.test.mjs
git commit -m "feat: add discovery suggestion builder"
```

---

### Task 5: Suppression

**Files:**
- Create: `scripts/lib/discovery/suppress.mjs`
- Test: `test/discovery/suppress.test.mjs`

**Interfaces:**
- Consumes: the entity shape from Task 3; `movements.config.json` parsed as an object.
- Produces: `findTrackedMatch(entity, config: object): string | null` — the id of an existing movement this entity already belongs to, or `null`.

**Why:** `2026 Delhi Jantar Mantar protests` must resolve to the existing `india-cjp` rather than being proposed as new. Matching is on distinctive name terms against a movement's configured keywords, gated on country so a term like "finance" cannot cross borders.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/suppress.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTrackedMatch } from '../../scripts/lib/discovery/suppress.mjs';

const config = {
  'india-cjp': {
    name: 'CJP Protests', location: 'Delhi, India', region: 'Asia',
    keywords: ['NEET', 'Jantar Mantar', 'CJP'],
    strictKeywords: ['jantar mantar', 'neet', 'paper leak'],
  },
  'kenya-finance': {
    name: 'Kenya Finance Bill Protests', location: 'Nairobi, Kenya', region: 'Africa',
    keywords: ['finance bill', 'Ruto'], strictKeywords: ['finance bill', 'tax protest'],
  },
};

const entity = (name, country) => ({ name, country, countries: [country] });

test('matches an entity to the movement already tracking it', () => {
  assert.equal(
    findTrackedMatch(entity('2026 Delhi Jantar Mantar protests', 'India'), config),
    'india-cjp',
  );
});

test('does not match across countries', () => {
  assert.equal(findTrackedMatch(entity('2026 Finance Bill protests', 'Uganda'), config), null);
});

test('returns null for a genuinely new movement', () => {
  assert.equal(findTrackedMatch(entity('2026 Bolivian protests', 'Bolivia'), config), null);
});

test('ignores generic protest vocabulary when matching', () => {
  // "protests" alone must never match an existing movement.
  assert.equal(findTrackedMatch(entity('2026 Mumbai protests', 'India'), config), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/suppress.test.mjs`
Expected: FAIL — cannot find module `suppress.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/suppress.mjs`:

```javascript
// Keeps discovery from re-proposing a movement the archive already covers.
// Country-gated so a shared topic word ("finance bill") cannot match a
// movement on another continent.

const GENERIC = new Set([
  'protest', 'protests', 'demonstration', 'demonstrations', 'rally', 'rallies',
  'strike', 'strikes', 'march', 'marches', 'riot', 'riots', 'unrest', 'clashes',
  'the', 'of', 'in', 'at', 'and', 'against',
]);

function terms(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

function mentionsCountry(cfg, country) {
  const hay = `${cfg.location || ''} ${cfg.name || ''}`.toLowerCase();
  return hay.includes(String(country || '').toLowerCase());
}

export function findTrackedMatch(entity, config) {
  const entityTerms = new Set(terms(entity.name));
  if (entityTerms.size === 0) return null;
  for (const [id, cfg] of Object.entries(config || {})) {
    if (!mentionsCountry(cfg, entity.country)) continue;
    const configTerms = new Set([
      ...terms((cfg.keywords || []).join(' ')),
      ...terms((cfg.strictKeywords || []).join(' ')),
    ]);
    for (const t of entityTerms) {
      if (configTerms.has(t)) return id;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 24 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/suppress.mjs test/discovery/suppress.test.mjs
git commit -m "feat: suppress discovery candidates already tracked"
```

---

### Task 6: State and candidate store

**Files:**
- Create: `scripts/lib/discovery/store.mjs`
- Test: `test/discovery/store.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readState(dir: string): { promoted: string[], rejected: string[], clusters: object }`
  - `writeState(dir, state): void`
  - `writeCandidates(dir, candidates: object[]): void`
  - `readCandidates(dir): { generated: string, candidates: object[] }`

- [ ] **Step 1: Write the failing test**

Create `test/discovery/store.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readState, writeState, readCandidates, writeCandidates } from '../../scripts/lib/discovery/store.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));

test('readState returns an empty shape when the file is missing', () => {
  const s = readState(tmp());
  assert.deepEqual(s.promoted, []);
  assert.deepEqual(s.rejected, []);
  assert.deepEqual(s.clusters, {});
});

test('writeState then readState round-trips', () => {
  const dir = tmp();
  writeState(dir, { promoted: ['wd-Q1'], rejected: ['wd-Q2'], clusters: {} });
  assert.deepEqual(readState(dir).promoted, ['wd-Q1']);
});

test('writes JSON with 2-space indent and trailing newline, matching aggregate.mjs', () => {
  const dir = tmp();
  writeState(dir, { promoted: [], rejected: [], clusters: {} });
  const raw = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.ok(raw.includes('\n  "promoted"'));
});

test('writeCandidates stamps a generated timestamp', () => {
  const dir = tmp();
  writeCandidates(dir, [{ key: 'wd-Q1' }]);
  const out = readCandidates(dir);
  assert.equal(out.candidates.length, 1);
  assert.ok(!Number.isNaN(Date.parse(out.generated)));
});

test('readState tolerates a corrupt file rather than crashing the run', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'state.json'), '{ not json');
  assert.deepEqual(readState(dir).promoted, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/store.test.mjs`
Expected: FAIL — cannot find module `store.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/store.mjs`:

```javascript
// Persistence for discovery. Lives in discovery/, never public/data/, so
// unreviewed candidates are not served on the public site.

import fs from 'node:fs';
import path from 'node:path';

const EMPTY_STATE = { promoted: [], rejected: [], clusters: {} };

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function readState(dir) {
  const s = readJson(path.join(dir, 'state.json'), EMPTY_STATE);
  return {
    promoted: Array.isArray(s.promoted) ? s.promoted : [],
    rejected: Array.isArray(s.rejected) ? s.rejected : [],
    clusters: s.clusters && typeof s.clusters === 'object' ? s.clusters : {},
  };
}

export function writeState(dir, state) {
  writeJson(path.join(dir, 'state.json'), state);
}

export function readCandidates(dir) {
  return readJson(path.join(dir, 'candidates.json'), { generated: null, candidates: [] });
}

export function writeCandidates(dir, candidates) {
  writeJson(path.join(dir, 'candidates.json'), {
    generated: new Date().toISOString(),
    candidates,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 29 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discovery/store.mjs test/discovery/store.test.mjs
git commit -m "feat: add discovery state and candidate store"
```

---

### Task 7: The discover entry point

**Files:**
- Create: `scripts/discover.mjs`
- Test: `test/discovery/discover.test.mjs`

**Interfaces:**
- Consumes: every module from Tasks 1-6.
- Produces: `buildCandidates({ entities, config, state }): object[]` — exported for testing; `main()` runs the network path.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/discover.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidates } from '../../scripts/discover.mjs';

const config = {
  'india-cjp': {
    name: 'CJP Protests', location: 'Delhi, India',
    keywords: ['NEET', 'Jantar Mantar'], strictKeywords: ['jantar mantar'],
  },
};
const state = { promoted: ['wd-Q999'], rejected: ['wd-Q888'], clusters: {} };

const ent = (qid, name, country) => ({
  qid, name, country, countries: [country],
  description: '', wikipedia: '', needsName: false,
});

test('produces a candidate for a genuinely new movement', () => {
  const out = buildCandidates({ entities: [ent('Q1', '2026 Bolivian protests', 'Bolivia')], config, state });
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'wd-Q1');
  assert.equal(out[0].source, 'wikidata');
  assert.equal(out[0].confidence, 'high');
  assert.equal(out[0].suggested.region, 'Americas');
});

test('suppresses an entity already tracked by a movement', () => {
  const out = buildCandidates({
    entities: [ent('Q2', '2026 Delhi Jantar Mantar protests', 'India')], config, state,
  });
  assert.equal(out.length, 0);
});

test('suppresses promoted and rejected keys', () => {
  const out = buildCandidates({
    entities: [ent('Q999', 'A protests', 'Bolivia'), ent('Q888', 'B protests', 'Bolivia')],
    config, state,
  });
  assert.equal(out.length, 0);
});

test('assigns unique ids when two candidates would collide', () => {
  const out = buildCandidates({
    entities: [ent('Q3', 'Bolivian protests', 'Bolivia'), ent('Q4', 'Bolivian protests', 'Bolivia')],
    config, state,
  });
  assert.notEqual(out[0].suggested.id, out[1].suggested.id);
});

test('drops entities with no country, which cannot be filed or localized', () => {
  const out = buildCandidates({ entities: [ent('Q5', 'Some protests', '')], config, state });
  assert.equal(out.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/discover.test.mjs`
Expected: FAIL — cannot find module `discover.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/discover.mjs`:

```javascript
#!/usr/bin/env node
// ProtestTracker discovery — Wikidata tier.
//
// Queries Wikidata for protest entities with a recent start date, drops the
// ones already tracked/promoted/rejected, and writes discovery/candidates.json
// for human review. It NEVER writes to public/data or movements.config.json:
// promoting a candidate is scripts/promote.mjs, run by a person.
//
// Exit 0 even when the query fails — discovery must never break the site.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchJson } from './lib/discovery/fetch.mjs';
import { SPARQL_ENDPOINT, buildQuery, parseBindings } from './lib/discovery/wikidata.mjs';
import { buildSuggestion } from './lib/discovery/suggest.mjs';
import { findTrackedMatch } from './lib/discovery/suppress.mjs';
import { readState, writeState, writeCandidates } from './lib/discovery/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DISCOVERY_DIR = path.join(ROOT, 'discovery');
const CONFIG_PATH = path.join(__dirname, 'movements.config.json');

const LOOKBACK_MONTHS = 18;

export function buildCandidates({ entities, config, state }) {
  const existingIds = Object.keys(config || {});
  const seen = new Set(existingIds);
  const out = [];
  for (const e of entities) {
    const key = `wd-${e.qid}`;
    // No country means we cannot assign a region or a news locale.
    if (!e.country) continue;
    if (state.promoted.includes(key) || state.rejected.includes(key)) continue;
    const tracked = findTrackedMatch(e, config);
    if (tracked) continue;
    const suggested = buildSuggestion(e, [...seen]);
    seen.add(suggested.id);
    out.push({
      key,
      source: 'wikidata',
      confidence: 'high',
      country: e.country,
      countries: e.countries,
      wikipedia: e.wikipedia,
      needsName: e.needsName,
      suggested,
    });
  }
  return out;
}

function cutoffIso(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.toISOString().slice(0, 19)}Z`;
}

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const state = readState(DISCOVERY_DIR);

  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(buildQuery(cutoffIso(LOOKBACK_MONTHS)))}&format=json`;
  let entities = [];
  try {
    entities = parseBindings(await fetchJson(url));
    console.log(`Wikidata returned ${entities.length} protest entities.`);
  } catch (err) {
    console.warn(`Wikidata query failed: ${err.message}`);
    console.warn('Leaving the existing candidate queue untouched.');
    return;
  }

  const candidates = buildCandidates({ entities, config, state });
  writeCandidates(DISCOVERY_DIR, candidates);
  writeState(DISCOVERY_DIR, state);

  console.log(`\n${candidates.length} candidate(s) for review:`);
  for (const c of candidates) {
    console.log(`  ${c.key}  ${c.suggested.name}  (${c.country} / ${c.suggested.region || 'region?'})`);
  }
  console.log(`\nPromote one with:  npm run promote -- <key>`);
}

// Only run the network path when executed directly, so tests can import
// buildCandidates without firing a query.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error('discovery failed:', err);
    process.exit(0); // Never break the pipeline.
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 34 tests total.

- [ ] **Step 5: Run it against the live endpoint**

Run: `npm run discover`
Expected: prints an entity count and a candidate list; creates `discovery/candidates.json` and `discovery/state.json`. Confirm `2026 Delhi Jantar Mantar protests` does NOT appear (it is suppressed by `india-cjp`).

- [ ] **Step 6: Commit**

```bash
git add scripts/discover.mjs test/discovery/discover.test.mjs discovery/
git commit -m "feat: add Wikidata discovery entry point"
```

---

### Task 8: The promote command

**Files:**
- Create: `scripts/promote.mjs`
- Test: `test/discovery/promote.test.mjs`

**Interfaces:**
- Consumes: `readCandidates`, `readState`, `writeState` from Task 6.
- Produces: `applyPromotion({ candidate, config }): object` — the new config object; `main()` handles argv and file IO.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/promote.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPromotion } from '../../scripts/promote.mjs';

const candidate = {
  key: 'wd-Q1',
  suggested: {
    id: 'bolivia-bolivian', name: '2026 Bolivian protests', region: 'Americas',
    location: 'Bolivia', year: 2026, description: 'anti-government protests',
    keywords: ['bolivian', 'bolivia', 'protest'], strictKeywords: ['bolivian'],
    feeds: ['https://news.google.com/rss/search?q=x'], manualStatus: null,
    _source: { wikidata: 'Q1', wikipedia: 'https://en.wikipedia.org/wiki/X' },
  },
};

test('adds the movement under its suggested id', () => {
  const out = applyPromotion({ candidate, config: {} });
  assert.ok(out['bolivia-bolivian']);
  assert.equal(out['bolivia-bolivian'].name, '2026 Bolivian protests');
});

test('strips the internal _source key from the written config', () => {
  const out = applyPromotion({ candidate, config: {} });
  assert.equal(out['bolivia-bolivian']._source, undefined);
});

test('preserves existing movements', () => {
  const out = applyPromotion({ candidate, config: { 'kenya-finance': { name: 'Kenya' } } });
  assert.equal(Object.keys(out).length, 2);
  assert.equal(out['kenya-finance'].name, 'Kenya');
});

test('refuses to overwrite an existing movement id', () => {
  assert.throws(
    () => applyPromotion({ candidate, config: { 'bolivia-bolivian': { name: 'existing' } } }),
    /already exists/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/promote.test.mjs`
Expected: FAIL — cannot find module `promote.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/promote.mjs`:

```javascript
#!/usr/bin/env node
// Promote a discovery candidate into movements.config.json, or reject it.
//
//   npm run promote -- wd-Q12345
//   npm run promote -- --reject wd-Q12345
//
// Promotion only writes the config block. The movement's articles appear on
// the next `npm run aggregate`, and its page exists after the next build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCandidates, readState, writeState } from './lib/discovery/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DISCOVERY_DIR = path.join(ROOT, 'discovery');
const CONFIG_PATH = path.join(__dirname, 'movements.config.json');

export function applyPromotion({ candidate, config }) {
  const { id, ...block } = candidate.suggested;
  if (config[id]) throw new Error(`movement id "${id}" already exists in movements.config.json`);
  delete block._source;
  return { ...config, [id]: block };
}

function main() {
  const args = process.argv.slice(2);
  const reject = args.includes('--reject');
  const key = args.find((a) => !a.startsWith('-'));
  if (!key) {
    console.error('usage: npm run promote -- <candidate-key> [--reject]');
    process.exit(1);
  }

  const { candidates } = readCandidates(DISCOVERY_DIR);
  const candidate = candidates.find((c) => c.key === key);
  if (!candidate) {
    console.error(`no candidate with key "${key}" in discovery/candidates.json`);
    process.exit(1);
  }

  const state = readState(DISCOVERY_DIR);

  if (reject) {
    if (!state.rejected.includes(key)) state.rejected.push(key);
    writeState(DISCOVERY_DIR, state);
    console.log(`Rejected ${key}. It will not be proposed again.`);
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const updated = applyPromotion({ candidate, config });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(updated, null, 2)}\n`);

  if (!state.promoted.includes(key)) state.promoted.push(key);
  writeState(DISCOVERY_DIR, state);

  const id = candidate.suggested.id;
  console.log(`Promoted ${key} -> ${id}\n`);
  console.log('Next steps:');
  console.log(`  1. Edit scripts/movements.config.json: tighten "${id}".strictKeywords`);
  console.log('     and add publisher RSS feeds — this is what keeps the feed clean.');
  if (candidate.wikipedia) console.log(`  2. Background reading: ${candidate.wikipedia}`);
  console.log(`  3. Backfill coverage:  npm run aggregate -- ${id}`);
  console.log('  4. Review the result, then commit.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 38 tests total.

- [ ] **Step 5: Verify the type-check still passes**

Run: `npm run typecheck`
Expected: PASS. (These are `.mjs` files outside the TS program; this confirms nothing regressed.)

- [ ] **Step 6: Commit**

```bash
git add scripts/promote.mjs test/discovery/promote.test.mjs
git commit -m "feat: add candidate promote and reject command"
```

---

### Task 9: Seed background from Wikipedia (`--with-background`)

**Files:**
- Create: `scripts/lib/discovery/background.mjs`
- Modify: `scripts/promote.mjs`
- Test: `test/discovery/background.test.mjs`

**Interfaces:**
- Consumes: `fetchJson` from Task 2; `candidate.wikipedia` from Task 7.
- Produces:
  - `summaryUrl(articleUrl: string): string`
  - `buildBackgroundBlocks(extract: string, title: string, url: string): Array<{type: 'h'|'p', text: string}>`

**Why:** A promoted movement otherwise renders four visibly empty sections (`pages/movements/[id].tsx` always shows Timeline, Background, Legal, Sources). Seeding Background gives it real context on day one.

**Licensing:** Wikipedia text is CC BY-SA. The attribution block is not optional — it must name the article, link it, and state the licence. The block shape matches `BackgroundBlock` in `lib/types.ts` exactly.

**Verified endpoint:** `https://en.wikipedia.org/api/rest_v1/page/summary/<title>` returns `{ extract, title, content_urls.desktop.page }`.

- [ ] **Step 1: Write the failing test**

Create `test/discovery/background.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryUrl, buildBackgroundBlocks } from '../../scripts/lib/discovery/background.mjs';

test('derives the REST summary URL from an article URL', () => {
  assert.equal(
    summaryUrl('https://en.wikipedia.org/wiki/2026_Ugandan_protests'),
    'https://en.wikipedia.org/api/rest_v1/page/summary/2026_Ugandan_protests',
  );
});

test('builds heading + paragraph blocks matching the BackgroundBlock shape', () => {
  const blocks = buildBackgroundBlocks(
    'First para.\n\nSecond para.',
    '2026 Ugandan protests',
    'https://en.wikipedia.org/wiki/2026_Ugandan_protests',
  );
  assert.equal(blocks[0].type, 'h');
  assert.equal(blocks[1].type, 'p');
  assert.equal(blocks[1].text, 'First para.');
  assert.equal(blocks[2].text, 'Second para.');
  assert.ok(blocks.every((b) => b.type === 'h' || b.type === 'p'));
});

test('always appends a CC BY-SA attribution naming the article and licence', () => {
  const blocks = buildBackgroundBlocks('Text.', 'Some protests', 'https://en.wikipedia.org/wiki/Some_protests');
  const last = blocks[blocks.length - 1];
  assert.equal(last.type, 'p');
  assert.match(last.text, /CC BY-SA/);
  assert.match(last.text, /Some protests/);
  assert.match(last.text, /https:\/\/en\.wikipedia\.org\/wiki\/Some_protests/);
});

test('returns no blocks for an empty extract, so nothing unattributed is written', () => {
  assert.deepEqual(buildBackgroundBlocks('', 'X', 'https://example.test'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discovery/background.test.mjs`
Expected: FAIL — cannot find module `background.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/discovery/background.mjs`:

```javascript
// Seeds a promoted movement's background.json from the lead section of its
// Wikipedia article. Wikipedia text is CC BY-SA, so the attribution block is
// mandatory and is appended here rather than left to the caller.

export function summaryUrl(articleUrl) {
  const title = String(articleUrl || '').split('/wiki/').pop() || '';
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
}

export function buildBackgroundBlocks(extract, title, url) {
  const text = String(extract || '').trim();
  if (!text) return [];
  const paras = text.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
  return [
    { type: 'h', text: 'Background' },
    ...paras.map((t) => ({ type: 'p', text: t })),
    {
      type: 'p',
      text: `This background is adapted from the Wikipedia article "${title}" (${url}), available under the CC BY-SA 4.0 licence.`,
    },
  ];
}
```

- [ ] **Step 4: Wire the flag into promote.mjs**

In `scripts/promote.mjs`, add these imports below the existing `store.mjs` import:

```javascript
import { fetchJson } from './lib/discovery/fetch.mjs';
import { summaryUrl, buildBackgroundBlocks } from './lib/discovery/background.mjs';
```

Change `function main() {` to `async function main() {`, and change the bottom guard call from `main();` to:

```javascript
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
```

Then, immediately before the final `console.log('  4. Review the result, then commit.');`, insert:

```javascript
  if (args.includes('--with-background') && candidate.wikipedia) {
    try {
      const summary = await fetchJson(summaryUrl(candidate.wikipedia));
      const blocks = buildBackgroundBlocks(
        summary.extract,
        summary.title,
        summary.content_urls?.desktop?.page || candidate.wikipedia,
      );
      if (blocks.length) {
        const dir = path.join(ROOT, 'public', 'data', id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'background.json'), `${JSON.stringify({ blocks }, null, 2)}\n`);
        console.log(`  (seeded public/data/${id}/background.json from Wikipedia, CC BY-SA)`);
      }
    } catch (err) {
      console.warn(`  (background seed skipped: ${err.message})`);
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 42 tests total.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/discovery/background.mjs scripts/promote.mjs test/discovery/background.test.mjs
git commit -m "feat: seed promoted movement background from Wikipedia"
```

---

### Task 10: Daily CI workflow

**Files:**
- Create: `.github/workflows/discover.yml`

**Interfaces:**
- Consumes: `npm run discover` from Task 7.
- Produces: a daily commit to `discovery/` and a step summary listing candidates.

**Constraint:** `.github/workflows/deploy.yml` is NOT modified. Its commit step stages `public/data` only, so it will never pick up `discovery/`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/discover.yml`:

```yaml
# Daily protest discovery. Writes only to discovery/ — never to public/data
# or movements.config.json. Promoting a candidate is a manual step
# (npm run promote -- <key>), so nothing reaches the site unreviewed.
name: Discover

on:
  schedule:
    # Daily at 03:00 UTC. Wikidata items appear over days, not hours.
    - cron: "0 3 * * *"
  workflow_dispatch:

permissions:
  contents: write

# Never run two discovery jobs at once; they both write discovery/state.json.
concurrency:
  group: "discover"
  cancel-in-progress: false

jobs:
  discover:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          persist-credentials: true

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test

      - name: Discover candidates
        # An upstream outage must never fail the job.
        continue-on-error: true
        run: npm run discover | tee discover.log

      - name: Write step summary
        if: always()
        run: |
          {
            echo "## Protest discovery candidates"
            echo ""
            echo '```'
            tail -n 40 discover.log 2>/dev/null || echo "no output"
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Commit candidate queue
        if: >-
          github.ref == 'refs/heads/main' &&
          github.repository == github.event.repository.full_name
        run: |
          rm -f discover.log
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add discovery
          if git diff --cached --quiet; then
            echo "No candidate changes to commit."
          else
            git commit -m "chore: refresh discovery candidates [skip ci]"
            git push
          fi
```

- [ ] **Step 2: Validate the workflow parses**

Run: `node -e "const s=require('fs').readFileSync('.github/workflows/discover.yml','utf8'); if(!s.includes('npm run discover')) throw new Error('missing run step'); console.log('workflow references discover:', s.split('\n').length, 'lines')"`
Expected: prints the line count without throwing.

- [ ] **Step 3: Confirm deploy.yml is untouched**

Run: `git diff --stat .github/workflows/deploy.yml`
Expected: empty output.

- [ ] **Step 4: Run the full suite once more**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/discover.yml
git commit -m "chore: add daily discovery workflow"
```

---

## Done criteria

- `npm test` passes (42 tests).
- `npm run discover` writes `discovery/candidates.json` with real Wikidata candidates.
- `2026 Delhi Jantar Mantar protests` is suppressed as already tracked by `india-cjp`.
- `npm run promote -- <key>` adds a block to `movements.config.json` and prints next steps.
- `npm run promote -- <key> --with-background` additionally seeds `background.json` with CC BY-SA attribution.
- `npm run typecheck` passes.
- `scripts/aggregate.mjs` and `.github/workflows/deploy.yml` show no diff.
