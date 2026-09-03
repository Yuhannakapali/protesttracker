// Persistence for discovery. Lives in discovery/, never public/data/, so
// unreviewed candidates are not served on the public site.

import fs from 'node:fs';
import path from 'node:path';

const EMPTY_STATE = { promoted: [], rejected: [], clusters: {} };

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function readState(dir) {
  const s = readJson(path.join(dir, 'state.json'), EMPTY_STATE);
  return {
    promoted: Array.isArray(s.promoted) ? s.promoted : [],
    rejected: Array.isArray(s.rejected) ? s.rejected : [],
    clusters: s.clusters && typeof s.clusters === 'object' ? s.clusters : {},
  };
}

export function writeState(dir, state) {
  writeJson(path.join(dir, 'state.json'), state);
}

export function readCandidates(dir) {
  return readJson(path.join(dir, 'candidates.json'), { generated: null, candidates: [] });
}

export function writeCandidates(dir, candidates) {
  writeJson(path.join(dir, 'candidates.json'), {
    generated: new Date().toISOString(),
    candidates,
  });
}
