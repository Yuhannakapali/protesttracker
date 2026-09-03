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

test('drops month names, which are dates rather than topics', () => {
  // "June 2026 Indonesian protests" must not yield "june" as a strict keyword:
  // it would match any story mentioning the month.
  const s = buildSuggestion(entity({ name: 'June 2026 Indonesian protests', country: 'Indonesia', countries: ['Indonesia'] }), []);
  assert.ok(!s.strictKeywords.includes('june'));
  assert.ok(s.strictKeywords.includes('indonesian'));
  // The id keeps the month: it disambiguates "June 2026 Indonesian protests"
  // from an "August 2026 Indonesian protests" that would otherwise collide.
  assert.equal(s.id, 'indonesia-june-indonesian-protests');
});
