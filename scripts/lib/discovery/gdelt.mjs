// GDELT is the breadth tier: it finds protests before anyone writes a
// Wikipedia article about them. It is noisy by nature, so nothing here
// decides anything — clustering and the graduation bar do that.
//
// theme:PROTEST was measured and rejected: GDELT's thematic tagging returned
// a case-law listing, an opinion column and a poultry-shop closure. Plain
// text lexicons are more predictable.
//
// Two hard-won API facts:
//   - OR'd terms MUST be wrapped in parentheses, or GDELT returns the error
//     "Queries containing OR'd terms must be surrounded by ()." as HTTP 200.
//   - Density is load-bearing. A sparse global sample (2d, 75 records)
//     produced 63 singleton clusters and one false positive; per-country
//     queries at 7d/250 produced real, well-separated movements.

export const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

// One pass per (language, country). English-only querying was measured to
// skew heavily India/US, which is why the non-English rows exist.
export const QUERY_MATRIX = [
  { lang: 'eng', terms: ['protest', 'demonstration', 'rally', 'strike', 'march', 'walkout', 'blockade'],
    countries: ['Nigeria', 'Kenya', 'India', 'SouthAfrica', 'Philippines', 'UnitedKingdom'] },
  { lang: 'spa', terms: ['protesta', 'manifestacion', 'huelga', 'paro', 'marcha'],
    countries: ['Spain', 'Chile', 'Argentina', 'Mexico', 'Colombia', 'Peru'] },
  { lang: 'ind', terms: ['unjuk rasa', 'demo', 'mogok'], countries: ['Indonesia'] },
  { lang: 'fra', terms: ['manifestation', 'greve'], countries: ['France', 'Senegal', 'IvoryCoast'] },
  { lang: 'por', terms: ['protesto', 'greve', 'manifestacao'], countries: ['Brazil', 'Portugal'] },
];

export function buildGdeltUrl({ lang, terms, country, timespan = '7d', maxrecords = 250 }) {
  const phrase = terms.map((t) => (t.includes(' ') ? `"${t}"` : t)).join(' OR ');
  const parts = [`(${phrase})`, `sourcelang:${lang}`];
  if (country) parts.push(`sourcecountry:${country}`);
  const query = encodeURIComponent(parts.join(' '));
  return `${GDELT_ENDPOINT}?query=${query}&mode=artlist&maxrecords=${maxrecords}&format=json&timespan=${timespan}`;
}

// "20260902T003000Z" -> "2026-09-02". new Date() cannot parse the compact form.
export function seendateToIso(seendate) {
  const m = String(seendate || '').match(/^(\d{4})(\d{2})(\d{2})T/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export function parseArticles(json) {
  const rows = json?.articles;
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const a of rows) {
    const title = String(a?.title || '').trim();
    const domain = String(a?.domain || '').trim().toLowerCase();
    const country = String(a?.sourcecountry || '').trim();
    const date = seendateToIso(a?.seendate);
    // Without all four we cannot cluster, attribute, or date the item.
    if (!title || !domain || !country || !date) continue;
    out.push({ title, url: String(a.url || ''), domain, country, date, language: String(a.language || '') });
  }
  return out;
}
