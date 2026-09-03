// Titles are the only text GDELT gives us — there is no article body, and
// titles arrive truncated at roughly 60 characters (measured: 8.5 usable
// tokens each). So tokenization has to earn a lot from very little, and the
// stopword list carries the weight.

const DIACRITICS = /[\u0300-\u036f]/g;

// Function words across the five query languages, plus the protest and
// policing vocabulary that appears in nearly every document in this corpus
// and so distinguishes nothing. "police" and "government" were measured as
// corpus-wide and are excluded here rather than relying on the frequency cut.
const STOPWORDS = new Set([
  // protest vocabulary — present in everything
  'protest', 'protests', 'protester', 'protesters', 'protesta', 'protestas',
  'protesto', 'protestos', 'demonstration', 'demonstrations', 'demonstrators',
  'demo', 'manifestacion', 'manifestaciones', 'manifestation', 'manifestations',
  'manifestacao', 'manifestacoes', 'rally', 'rallies', 'strike', 'strikes',
  'huelga', 'huelgas', 'greve', 'grevistas', 'paro', 'march', 'marcha',
  'marches', 'riot', 'riots', 'unrest', 'clash', 'clashes', 'walkout',
  'blockade', 'unjuk', 'rasa', 'mogok', 'aksi',
  // policing / government — corpus-wide in protest coverage
  'police', 'government', 'cops', 'officers', 'arrested', 'detained',
  // English function words
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'are',
  'was', 'were', 'not', 'but', 'his', 'her', 'its', 'their', 'over', 'after',
  'says', 'said', 'new', 'amid', 'into', 'out', 'off', 'against', 'more',
  'than', 'who', 'why', 'how', 'could', 'public', 'used', 'call', 'calls',
  'held', 'holds', 'stage', 'staged', 'during', 'about', 'will', 'would',
  // Spanish / Portuguese
  'los', 'las', 'del', 'con', 'por', 'para', 'que', 'una', 'uno', 'sobre',
  'como', 'dos', 'das', 'nao', 'mais', 'seu', 'sua', 'pela', 'pelo', 'aos',
  // French
  'les', 'des', 'une', 'dans', 'pour', 'sur', 'aux', 'est', 'sont', 'par',
  // Indonesian
  'dan', 'yang', 'untuk', 'dari', 'dengan', 'para', 'akan', 'ini', 'itu',
]);

export function tokenize(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export function documentFrequency(tokenLists) {
  const df = new Map();
  for (const tokens of tokenLists) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  return df;
}

// Keep only tokens rarer than `maxDocFreq` of the corpus, rarest first. The
// 5% default is a starting value tuned against captured fixtures, not a
// derived constant.
export function distinctiveTerms(tokens, df, corpusSize, { maxTerms = 8, maxDocFreq = 0.05 } = {}) {
  const limit = Math.max(1, corpusSize * maxDocFreq);
  return [...new Set(tokens)]
    .filter((t) => (df.get(t) || 0) <= limit)
    .sort((a, b) => (df.get(a) || 0) - (df.get(b) || 0) || a.localeCompare(b))
    .slice(0, maxTerms);
}
