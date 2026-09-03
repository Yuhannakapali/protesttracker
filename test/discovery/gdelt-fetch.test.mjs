import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMatrix } from '../../scripts/lib/discovery/gdelt-fetch.mjs';

const matrix = [{ lang: 'eng', terms: ['protest'], countries: ['Kenya', 'Nigeria'] }];

const payload = (domain) => ({
  articles: [{
    title: 'A protest happened', url: `https://${domain}/1`, domain,
    sourcecountry: 'Kenya', seendate: '20260902T003000Z', language: 'English',
  }],
});

test('fetches every (language, country) pair and flattens the articles', async () => {
  const seen = [];
  const out = await fetchMatrix({
    matrix,
    fetchJsonImpl: async (url) => { seen.push(url); return payload('a.test'); },
    sleepImpl: async () => {},
  });
  assert.equal(seen.length, 2);
  assert.equal(out.length, 2);
});

test('waits between requests to respect the 1-per-5s rate limit', async () => {
  const delays = [];
  await fetchMatrix({
    matrix,
    fetchJsonImpl: async () => payload('a.test'),
    sleepImpl: async (ms) => { delays.push(ms); },
    delayMs: 6000,
  });
  assert.ok(delays.length >= 1);
  assert.ok(delays.every((d) => d >= 6000), `expected >=6000ms, got ${delays}`);
});

test('one failing query does not abort the rest', async () => {
  let call = 0;
  const out = await fetchMatrix({
    matrix,
    fetchJsonImpl: async () => {
      call += 1;
      if (call === 1) throw new Error('non-JSON response (text/html)');
      return payload('b.test');
    },
    sleepImpl: async () => {},
  });
  assert.equal(out.length, 1);
});

test('reports progress and errors per pair so a CI log shows what happened', async () => {
  const events = [];
  await fetchMatrix({
    matrix,
    fetchJsonImpl: async () => { throw new Error('boom'); },
    sleepImpl: async () => {},
    onProgress: (e) => events.push(e),
  });
  assert.equal(events.length, 2);
  assert.ok(events.every((e) => e.error === 'boom'));
});
