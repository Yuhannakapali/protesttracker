#!/usr/bin/env node
// ProtestTracker discovery — Wikidata tier.
//
// Queries Wikidata for protest entities with a recent start date, drops the
// ones already tracked/promoted/rejected, and writes discovery/candidates.json
// for human review. It NEVER writes to public/data or movements.config.json:
// promoting a candidate is scripts/promote.mjs, run by a person.
//
// Exit 0 even when the query fails — discovery must never break the site.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchJson } from './lib/discovery/fetch.mjs';
import { SPARQL_ENDPOINT, buildQuery, parseBindings } from './lib/discovery/wikidata.mjs';
import { buildSuggestion } from './lib/discovery/suggest.mjs';
import { findTrackedMatch } from './lib/discovery/suppress.mjs';
import { readState, writeState, writeCandidates } from './lib/discovery/store.mjs';
import { fetchMatrix } from './lib/discovery/gdelt-fetch.mjs';
import { tokenize, documentFrequency, distinctiveTerms } from './lib/discovery/tokenize.mjs';
import { collapseSyndication, assignToClusters, evictStale } from './lib/discovery/cluster.mjs';
import { isDeniedDomain, isGraduated, clusterToEntity } from './lib/discovery/graduate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DISCOVERY_DIR = path.join(ROOT, 'discovery');
const CONFIG_PATH = path.join(__dirname, 'movements.config.json');

const LOOKBACK_MONTHS = 18;

export function buildCandidates({ entities, config, state }) {
  const existingIds = Object.keys(config || {});
  const seen = new Set(existingIds);
  const out = [];
  for (const e of entities) {
    const key = `wd-${e.qid}`;
    // No country means we cannot assign a region or a news locale.
    if (!e.country) continue;
    if (state.promoted.includes(key) || state.rejected.includes(key)) continue;
    const tracked = findTrackedMatch(e, config);
    if (tracked) continue;
    const suggested = buildSuggestion(e, [...seen]);
    seen.add(suggested.id);
    out.push({
      key,
      source: 'wikidata',
      confidence: 'high',
      country: e.country,
      countries: e.countries,
      wikipedia: e.wikipedia,
      needsName: e.needsName,
      suggested,
    });
  }
  return out;
}

// Tier 2: cluster GDELT coverage and graduate only what is sustained across
// days and carried by several independent outlets. Returns both the
// candidates and the updated cluster map, which the caller persists.
export function buildTier2Candidates({ articles, config, state, nowMs = Date.now(), maxDocFreq = 0.05 }) {
  const usable = articles.filter((a) => !isDeniedDomain(a.domain));

  // Collapse syndication BEFORE clustering: one wire story republished across
  // five domains is one source, and would otherwise satisfy the outlet bar on
  // its own.
  const stories = collapseSyndication(usable);

  const tokenLists = stories.map((a) => tokenize(a.title));
  const df = documentFrequency(tokenLists);
  const withTerms = stories.map((a, i) => ({
    ...a,
    terms: distinctiveTerms(tokenLists[i], df, stories.length, { maxDocFreq }),
  }));

  const carried = evictStale(state.clusters || {}, nowMs);
  const clusters = assignToClusters(withTerms, carried);

  const existingIds = Object.keys(config || {});
  const seen = new Set(existingIds);
  const candidates = [];

  for (const cluster of Object.values(clusters)) {
    if (!isGraduated(cluster)) continue;
    const key = `gd-${cluster.id}`;
    if (state.promoted.includes(key) || state.rejected.includes(key)) continue;
    if (findTrackedMatch({ name: cluster.terms.join(' '), country: cluster.country }, config)) continue;
    const suggested = buildSuggestion(clusterToEntity(cluster), [...seen]);
    seen.add(suggested.id);
    candidates.push({
      key,
      source: 'gdelt',
      confidence: 'low',
      country: cluster.country,
      countries: [cluster.country],
      domains: cluster.domains.filter((d) => !isDeniedDomain(d)),
      daysSeen: cluster.daysSeen.length,
      articleCount: cluster.articleCount,
      firstSeen: cluster.firstSeen,
      lastSeen: cluster.lastSeen,
      samples: cluster.samples,
      needsName: true,
      suggested,
    });
  }

  return { candidates, clusters };
}

function cutoffIso(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.toISOString().slice(0, 19)}Z`;
}

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const state = readState(DISCOVERY_DIR);

  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(buildQuery(cutoffIso(LOOKBACK_MONTHS)))}&format=json`;
  let entities = [];
  try {
    entities = parseBindings(await fetchJson(url));
    console.log(`Wikidata returned ${entities.length} protest entities.`);
  } catch (err) {
    console.warn(`Wikidata query failed: ${err.message}`);
    console.warn('Leaving the existing candidate queue untouched.');
    return;
  }

  const candidates = buildCandidates({ entities, config, state });
  writeCandidates(DISCOVERY_DIR, candidates);
  writeState(DISCOVERY_DIR, state);

  console.log(`\n${candidates.length} candidate(s) for review:`);
  for (const c of candidates) {
    console.log(`  ${c.key}  ${c.suggested.name}  (${c.country} / ${c.suggested.region || 'region?'})`);
  }
  console.log(`\nPromote one with:  npm run promote -- <key>`);
}

// Only run the network path when executed directly, so tests can import
// buildCandidates without firing a query.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error('discovery failed:', err);
    process.exit(0); // Never break the pipeline.
  });
}
