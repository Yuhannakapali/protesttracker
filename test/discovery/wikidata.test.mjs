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
