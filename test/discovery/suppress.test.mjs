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
