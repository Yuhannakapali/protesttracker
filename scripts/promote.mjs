#!/usr/bin/env node
// Promote a discovery candidate into movements.config.json, or reject it.
//
//   npm run promote -- wd-Q12345
//   npm run promote -- --reject wd-Q12345
//
// Promotion only writes the config block. The movement's articles appear on
// the next `npm run aggregate`, and its page exists after the next build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCandidates, readState, writeState } from './lib/discovery/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DISCOVERY_DIR = path.join(ROOT, 'discovery');
const CONFIG_PATH = path.join(__dirname, 'movements.config.json');

export function applyPromotion({ candidate, config }) {
  const { id, ...block } = candidate.suggested;
  if (config[id]) throw new Error(`movement id "${id}" already exists in movements.config.json`);
  delete block._source;
  return { ...config, [id]: block };
}

function main() {
  const args = process.argv.slice(2);
  const reject = args.includes('--reject');
  const key = args.find((a) => !a.startsWith('-'));
  if (!key) {
    console.error('usage: npm run promote -- <candidate-key> [--reject]');
    process.exit(1);
  }

  const { candidates } = readCandidates(DISCOVERY_DIR);
  const candidate = candidates.find((c) => c.key === key);
  if (!candidate) {
    console.error(`no candidate with key "${key}" in discovery/candidates.json`);
    process.exit(1);
  }

  const state = readState(DISCOVERY_DIR);

  if (reject) {
    if (!state.rejected.includes(key)) state.rejected.push(key);
    writeState(DISCOVERY_DIR, state);
    console.log(`Rejected ${key}. It will not be proposed again.`);
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const updated = applyPromotion({ candidate, config });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(updated, null, 2)}\n`);

  if (!state.promoted.includes(key)) state.promoted.push(key);
  writeState(DISCOVERY_DIR, state);

  const id = candidate.suggested.id;
  console.log(`Promoted ${key} -> ${id}\n`);
  console.log('Next steps:');
  console.log(`  1. Edit scripts/movements.config.json: tighten "${id}".strictKeywords`);
  console.log('     and add publisher RSS feeds — this is what keeps the feed clean.');
  if (candidate.wikipedia) console.log(`  2. Background reading: ${candidate.wikipedia}`);
  console.log(`  3. Backfill coverage:  npm run aggregate -- ${id}`);
  console.log('  4. Review the result, then commit.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
