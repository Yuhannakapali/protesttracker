import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTier2Candidates } from '../../scripts/discover.mjs';

const NOW = Date.parse('2026-09-04T00:00:00Z');
const emptyState = { promoted: [], rejected: [], clusters: {} };

// These fixtures are 3-4 articles. A 5% document-frequency cut on a corpus
// that small strips every term the articles share, so clustering could never
// happen. Disable the cut here and let thresholds.test.mjs exercise the real
// 0.05 against the committed 250-article fixture.
const OPTS = { maxDocFreq: 1 };

// Three outlets across three days, distinct wording — clears the bar.
const sustained = () => ([
  { title: 'Traders reject import duty rise in Nairobi', url: 'https://a.test/1', domain: 'a.test', country: 'Kenya', date: '2026-09-01' },
  { title: 'Import duty anger spreads among Nairobi traders', url: 'https://b.test/2', domain: 'b.test', country: 'Kenya', date: '2026-09-02' },
  { title: 'Nairobi traders shut shops over import duty', url: 'https://c.test/3', domain: 'c.test', country: 'Kenya', date: '2026-09-03' },
]);

test('graduates a sustained multi-outlet cluster into a low-confidence candidate', () => {
  const { candidates } = buildTier2Candidates({
    articles: sustained(), config: {}, state: emptyState, nowMs: NOW, ...OPTS,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source, 'gdelt');
  assert.equal(candidates[0].confidence, 'low');
  assert.equal(candidates[0].country, 'Kenya');
  assert.ok(candidates[0].daysSeen >= 3);
  assert.ok(candidates[0].domains.length >= 3);
  assert.equal(candidates[0].needsName, true);
});

test('does not graduate a single-outlet story', () => {
  const one = sustained().map((a) => ({ ...a, domain: 'a.test' }));
  const { candidates } = buildTier2Candidates({ articles: one, config: {}, state: emptyState, nowMs: NOW, ...OPTS });
  assert.equal(candidates.length, 0);
});

test('does not graduate a one-day flash', () => {
  const flash = sustained().map((a) => ({ ...a, date: '2026-09-01' }));
  const { candidates } = buildTier2Candidates({ articles: flash, config: {}, state: emptyState, nowMs: NOW, ...OPTS });
  assert.equal(candidates.length, 0);
});

test('syndicated copies of one story do not fake multi-outlet support', () => {
  // Same title on three domains is one source, not three.
  const syndicated = ['a.test', 'b.test', 'c.test'].map((d, i) => ({
    title: 'Traders reject import duty rise in Nairobi',
    url: `https://${d}/1`, domain: d, country: 'Kenya', date: `2026-09-0${i + 1}`,
  }));
  const { candidates } = buildTier2Candidates({ articles: syndicated, config: {}, state: emptyState, nowMs: NOW, ...OPTS });
  assert.equal(candidates.length, 0);
});

test('returns clusters so they can be persisted for the next run', () => {
  const { clusters } = buildTier2Candidates({
    articles: sustained(), config: {}, state: emptyState, nowMs: NOW, ...OPTS,
  });
  assert.ok(Object.keys(clusters).length >= 1);
});

test('drops articles from denylisted domains before clustering', () => {
  const withJunk = [...sustained(), {
    title: 'Import duty traders case listing', url: 'https://indiankanoon.org/1',
    domain: 'indiankanoon.org', country: 'Kenya', date: '2026-09-04',
  }];
  const { candidates } = buildTier2Candidates({ articles: withJunk, config: {}, state: emptyState, nowMs: NOW, ...OPTS });
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
    articles: sustained(), config, state: emptyState, nowMs: NOW, ...OPTS,
  });
  assert.equal(candidates.length, 0);
});

test('suppresses a rejected cluster key', () => {
  const first = buildTier2Candidates({ articles: sustained(), config: {}, state: emptyState, nowMs: NOW, ...OPTS });
  const key = first.candidates[0].key;
  const { candidates } = buildTier2Candidates({
    articles: sustained(), config: {},
    state: { promoted: [], rejected: [key], clusters: {} }, nowMs: NOW, ...OPTS,
  });
  assert.equal(candidates.length, 0);
});
