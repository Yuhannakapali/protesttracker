// Walks the query matrix serially. GDELT allows one request per 5 seconds
// and answers a violation with HTTP 200 and a plain-text body — fetchJson
// turns that into a thrown "non-JSON response", which we log and skip
// rather than letting it abort the run.

import { fetchJson } from './fetch.mjs';
import { QUERY_MATRIX, buildGdeltUrl, parseArticles } from './gdelt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchMatrix({
  matrix = QUERY_MATRIX,
  fetchJsonImpl = fetchJson,
  delayMs = 6000,
  sleepImpl = sleep,
  onProgress = () => {},
} = {}) {
  const all = [];
  const pairs = [];
  for (const row of matrix) {
    for (const country of row.countries) pairs.push({ lang: row.lang, terms: row.terms, country });
  }

  for (let i = 0; i < pairs.length; i += 1) {
    const { lang, terms, country } = pairs[i];
    const url = buildGdeltUrl({ lang, terms, country });
    try {
      const json = await fetchJsonImpl(url);
      const articles = parseArticles(json);
      all.push(...articles);
      onProgress({ lang, country, count: articles.length });
    } catch (err) {
      onProgress({ lang, country, count: 0, error: err.message });
    }
    if (i < pairs.length - 1) await sleepImpl(delayMs);
  }

  return all;
}
