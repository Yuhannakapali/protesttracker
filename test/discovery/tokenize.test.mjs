import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, documentFrequency, distinctiveTerms } from '../../scripts/lib/discovery/tokenize.mjs';

test('lowercases, strips punctuation, and drops short tokens', () => {
  // GDELT spaces its punctuation: "Protest : Police Deny , CDHR Dema"
  assert.deepEqual(
    tokenize('Lagos Pensioners Protest : Police Deny Teargassing , CDHR'),
    ['lagos', 'pensioners', 'deny', 'teargassing', 'cdhr'],
  );
});

test('folds diacritics so Spanish and Portuguese cluster with their ASCII forms', () => {
  assert.deepEqual(tokenize('Manifestación en Bogotá'), ['bogota']);
});

test('drops multilingual stopwords and generic protest vocabulary', () => {
  assert.deepEqual(tokenize('the protest de la huelga dos protestos'), []);
});

test('documentFrequency counts each term once per document', () => {
  const df = documentFrequency([['tax', 'tax', 'kenya'], ['tax', 'nairobi']]);
  assert.equal(df.get('tax'), 2);
  assert.equal(df.get('kenya'), 1);
});

test('distinctiveTerms keeps rare terms and drops corpus-wide ones', () => {
  // "police" appears in 100 of 100 docs; "msp" in 2.
  const df = new Map([['police', 100], ['msp', 2], ['punjab', 3]]);
  const out = distinctiveTerms(['police', 'msp', 'punjab'], df, 100);
  assert.ok(!out.includes('police'));
  assert.ok(out.includes('msp'));
  assert.ok(out.includes('punjab'));
});

test('distinctiveTerms caps the number of terms, rarest first', () => {
  const df = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
  const out = distinctiveTerms(['a', 'b', 'c', 'd'], df, 1000, { maxTerms: 2 });
  assert.deepEqual(out, ['a', 'b']);
});

test('a term absent from the corpus map is treated as maximally rare', () => {
  const out = distinctiveTerms(['unseen'], new Map(), 100);
  assert.deepEqual(out, ['unseen']);
});
