// Turns a normalized Wikidata entity into a draft movements.config.json
// block. Every field here is a starting point a human edits before the
// movement goes live — nothing produced by this module is authoritative.

import { countryToRegion, countryToIso2 } from './countries.mjs';

const DIACRITICS = /[\u0300-\u036f]/g;

export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    // Turkish dotless/dotted i survive NFD; fold them explicitly.
    .replace(/[ıİ]/g, 'i')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildId(name, country, existingIds = []) {
  const base = [slugify(country), slugify(name)].filter(Boolean).join('-') || 'movement';
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function googleNewsFeed(query, iso2) {
  const q = encodeURIComponent(query);
  if (!iso2) return `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=${encodeURIComponent('US:en')}`;
  return `https://news.google.com/rss/search?q=${q}&hl=en-${iso2}&gl=${iso2}&ceid=${encodeURIComponent(`${iso2}:en`)}`;
}

function yearFrom(name) {
  const m = String(name || '').match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : new Date().getFullYear();
}

// Distinctive words from the movement name, minus the generic protest
// vocabulary that would match any story anywhere.
const GENERIC = new Set([
  'protest', 'protests', 'demonstration', 'demonstrations', 'rally', 'rallies',
  'strike', 'strikes', 'march', 'marches', 'riot', 'riots', 'unrest', 'clashes',
  'the', 'of', 'in', 'at', 'and', 'against', 'a', 'to',
]);

function nameTerms(name) {
  return slugify(name)
    .split('-')
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

export function buildSuggestion(entity, existingIds = []) {
  const { name, country, description, qid, wikipedia } = entity;
  const iso2 = countryToIso2(country);
  const terms = nameTerms(name);
  return {
    id: buildId(name, country, existingIds),
    name,
    region: countryToRegion(country),
    location: country,
    year: yearFrom(name),
    description,
    // Broad list for Google News queries.
    keywords: [...new Set([...terms, country.toLowerCase(), 'protest'])].filter(Boolean),
    // Deliberately thin: a human tightens this before it filters anything.
    strictKeywords: [...new Set(terms)],
    feeds: [googleNewsFeed(name, iso2), googleNewsFeed(`${country} protest`, iso2)],
    manualStatus: null,
    // Provenance, stripped by promote.mjs before writing the config.
    _source: { wikidata: qid, wikipedia },
  };
}
