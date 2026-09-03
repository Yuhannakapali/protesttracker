import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readState, writeState, readCandidates, writeCandidates } from '../../scripts/lib/discovery/store.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));

test('readState returns an empty shape when the file is missing', () => {
  const s = readState(tmp());
  assert.deepEqual(s.promoted, []);
  assert.deepEqual(s.rejected, []);
  assert.deepEqual(s.clusters, {});
});

test('writeState then readState round-trips', () => {
  const dir = tmp();
  writeState(dir, { promoted: ['wd-Q1'], rejected: ['wd-Q2'], clusters: {} });
  assert.deepEqual(readState(dir).promoted, ['wd-Q1']);
});

test('writes JSON with 2-space indent and trailing newline, matching aggregate.mjs', () => {
  const dir = tmp();
  writeState(dir, { promoted: [], rejected: [], clusters: {} });
  const raw = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.ok(raw.includes('\n  "promoted"'));
});

test('writeCandidates stamps a generated timestamp', () => {
  const dir = tmp();
  writeCandidates(dir, [{ key: 'wd-Q1' }]);
  const out = readCandidates(dir);
  assert.equal(out.candidates.length, 1);
  assert.ok(!Number.isNaN(Date.parse(out.generated)));
});

test('readState tolerates a corrupt file rather than crashing the run', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'state.json'), '{ not json');
  assert.deepEqual(readState(dir).promoted, []);
});
