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
