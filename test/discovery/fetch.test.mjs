import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../../scripts/lib/discovery/fetch.mjs';

const ok = (body, headers = { 'content-type': 'application/json' }) => async () => ({
  ok: true, status: 200,
  headers: { get: (k) => headers[k.toLowerCase()] || null },
  text: async () => body,
});

test('parses a JSON body', async () => {
  const out = await fetchJson('https://example.test/x', { fetchImpl: ok('{"a":1}') });
  assert.deepEqual(out, { a: 1 });
});

test('rejects a non-JSON body served with HTTP 200', async () => {
  // GDELT returns its rate-limit notice this way.
  const body = 'Please limit requests to one every 5 seconds';
  await assert.rejects(
    () => fetchJson('https://example.test/x', { fetchImpl: ok(body, { 'content-type': 'text/html' }) }),
    /non-JSON response/,
  );
});

test('rejects an HTTP error', async () => {
  const fail = async () => ({ ok: false, status: 503, headers: { get: () => null }, text: async () => '' });
  await assert.rejects(() => fetchJson('https://example.test/x', { fetchImpl: fail }), /HTTP 503/);
});

test('sends a descriptive User-Agent as Wikimedia policy requires', async () => {
  let seen = null;
  const spy = async (_url, init) => {
    seen = init.headers['User-Agent'];
    return (await ok('{}')());
  };
  await fetchJson('https://example.test/x', { fetchImpl: spy });
  assert.match(seen, /ProtestTrackerBot/);
});
