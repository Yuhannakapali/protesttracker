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

test('denylisted domains do not count toward the outlet bar', () => {
  const c = cluster({ domains: ['a.test', 'b.test', 'indiankanoon.org'] });
  assert.equal(isGraduated(c), false);
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
