// Walks the query matrix serially. GDELT allows one request per 5 seconds,
// but in practice throttles harder under sustained use: a violation comes
// back either as HTTP 429 or as HTTP 200 with a plain-text body, which
// fetchJson turns into a thrown "non-JSON response".
//
// Both are transient, so they are retried with escalating backoff rather
// than skipped — skipping silently produced zero candidates in a live run.
// Any other error is permanent for that query and is reported, not retried.

import { fetchJson } from './fetch.mjs';
import { QUERY_MATRIX, buildGdeltUrl, parseArticles } from './gdelt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isRateLimit = (msg) => /HTTP 429|non-JSON response/i.test(String(msg || ''));

export async function fetchMatrix({
  matrix = QUERY_MATRIX,
  fetchJsonImpl = fetchJson,
  delayMs = 8000,
  sleepImpl = sleep,
  onProgress = () => {},
  // Budget: 19 pairs x (8s spacing + 12s + 24s backoff) is ~14 min worst
  // case, inside the workflow's 20-minute timeout. Three retries at 15s
  // escalation overran it.
  maxRetries = 2,
  backoffMs = 12000,
} = {}) {
  const all = [];
  const pairs = [];
  for (const row of matrix) {
    for (const country of row.countries) pairs.push({ lang: row.lang, terms: row.terms, country });
  }

  for (let i = 0; i < pairs.length; i += 1) {
    const { lang, terms, country } = pairs[i];
    const url = buildGdeltUrl({ lang, terms, country });
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const json = await fetchJsonImpl(url);
        const articles = parseArticles(json);
        all.push(...articles);
        onProgress({ lang, country, count: articles.length });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (!isRateLimit(err.message) || attempt === maxRetries) break;
        await sleepImpl(backoffMs * (attempt + 1));
      }
    }
    if (lastError) onProgress({ lang, country, count: 0, error: lastError.message });
    if (i < pairs.length - 1) await sleepImpl(delayMs);
  }

  return all;
}
