import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryToRegion, countryToIso2 } from '../../scripts/lib/discovery/countries.mjs';

test('maps countries to the region strings already used in movements.json', () => {
  assert.equal(countryToRegion('Kenya'), 'Africa');
  assert.equal(countryToRegion('India'), 'Asia');
  assert.equal(countryToRegion('Chile'), 'Americas');
  assert.equal(countryToRegion('Spain'), 'Europe');
});

test('covers regions not yet present in the data', () => {
  assert.equal(countryToRegion('Iraq'), 'Middle East');
  assert.equal(countryToRegion('Australia'), 'Oceania');
});

test('returns empty string for unknown countries rather than guessing', () => {
  assert.equal(countryToRegion('Atlantis'), '');
  assert.equal(countryToIso2('Atlantis'), '');
});

test('maps countries to ISO2 codes for Google News locale params', () => {
  assert.equal(countryToIso2('Indonesia'), 'ID');
  assert.equal(countryToIso2('Nigeria'), 'NG');
});

test('covers countries the live Wikidata run returned but the table missed', () => {
  // Found by running discovery against the real endpoint.
  assert.equal(countryToRegion('Timor-Leste'), 'Asia');
  assert.equal(countryToRegion('Madagascar'), 'Africa');
  assert.equal(countryToRegion('Paraguay'), 'Americas');
  assert.equal(countryToRegion('Togo'), 'Africa');
  assert.equal(countryToRegion('Angola'), 'Africa');
  assert.equal(countryToRegion('Mali'), 'Africa');
});

test('maps UK constituent countries, which Wikidata uses as P17 values', () => {
  assert.equal(countryToRegion('Northern Ireland'), 'Europe');
  assert.equal(countryToIso2('Northern Ireland'), 'GB');
});
