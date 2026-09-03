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

test('articles sharing 2+ terms in the same country join one cluster', () => {
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
