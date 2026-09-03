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
