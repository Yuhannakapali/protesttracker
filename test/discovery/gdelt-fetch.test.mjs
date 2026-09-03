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
      // A 500 is permanent for this query and is not retried, so the second
      // pair still runs. (Rate-limit errors ARE retried; see below.)
      if (call === 1) throw new Error('HTTP 500 for x');
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

test('retries with escalating backoff when GDELT rate-limits', async () => {
  let calls = 0;
  const waits = [];
  const out = await fetchMatrix({
    matrix: [{ lang: 'eng', terms: ['protest'], countries: ['Kenya'] }],
    fetchJsonImpl: async () => {
      calls += 1;
      if (calls < 3) throw new Error('HTTP 429 for https://api.gdeltproject.org/x');
      return payload('a.test');
    },
    sleepImpl: async (ms) => { waits.push(ms); },
  });
  assert.equal(calls, 3, 'should have retried twice before succeeding');
  assert.equal(out.length, 1);
  // Backoff escalates rather than hammering at a fixed interval. Asserted
  // relatively, so tuning the base delay does not break the test.
  assert.ok(waits.length >= 2, `expected at least two waits, got ${waits}`);
  const [first, second] = waits;
  assert.ok(second > first, `backoff should escalate, got ${waits}`);
});

test('gives up after the retry budget and reports the failure', async () => {
  const events = [];
  const out = await fetchMatrix({
    matrix: [{ lang: 'eng', terms: ['protest'], countries: ['Kenya'] }],
    fetchJsonImpl: async () => { throw new Error('HTTP 429 for x'); },
    sleepImpl: async () => {},
    onProgress: (e) => events.push(e),
  });
  assert.equal(out.length, 0);
  assert.equal(events.length, 1);
  assert.match(events[0].error, /429/);
});

test('does not retry a non-rate-limit error', async () => {
  let calls = 0;
  await fetchMatrix({
    matrix: [{ lang: 'eng', terms: ['protest'], countries: ['Kenya'] }],
    fetchJsonImpl: async () => { calls += 1; throw new Error('HTTP 500 for x'); },
    sleepImpl: async () => {},
  });
  assert.equal(calls, 1, 'a 500 is not a rate limit; retrying wastes the budget');
});
