// The only module in discovery that touches the network. `fetchImpl` is
// injectable so every other module can be tested against fixtures.
//
// A JSON body is not implied by HTTP 200: GDELT answers a rate-limit
// violation with 200 and a plain-text notice, which JSON.parse would throw
// on with a message that hides the real cause. Detect it and say so.

export const USER_AGENT = 'ProtestTrackerBot/1.0 (https://protesttracker.net)';

export async function fetchJson(url, { timeoutMs = 30000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json, application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = await res.text();
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) {
      throw new Error(`non-JSON response (${type || 'no content-type'}) for ${url}: ${body.slice(0, 120)}`);
    }
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}
