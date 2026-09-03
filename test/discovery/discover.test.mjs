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
