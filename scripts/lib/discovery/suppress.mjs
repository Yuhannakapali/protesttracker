// Keeps discovery from re-proposing a movement the archive already covers.
// Country-gated so a shared topic word ("finance bill") cannot match a
// movement on another continent.

const GENERIC = new Set([
  'protest', 'protests', 'demonstration', 'demonstrations', 'rally', 'rallies',
  'strike', 'strikes', 'march', 'marches', 'riot', 'riots', 'unrest', 'clashes',
  'the', 'of', 'in', 'at', 'and', 'against',
  // Month names are dates, not topics: "june" as a strict keyword would match
  // any story published about June anywhere.
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
]);

function terms(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

function mentionsCountry(cfg, country) {
  const hay = `${cfg.location || ''} ${cfg.name || ''}`.toLowerCase();
  return hay.includes(String(country || '').toLowerCase());
}

// `minShared` guards against over-suppression. One shared word is enough for
// a Wikidata entity, whose name is short and specific. A GDELT cluster
// accumulates terms from many headlines, so a single overlap is too loose:
// an unrelated Kerala student march was suppressed as india-cjp purely
// because both mention "student". Hiding a real movement is worse than
// proposing a duplicate — a reviewer can reject a duplicate, but never sees
// what was silently withheld.
export function findTrackedMatch(entity, config, { minShared = 1 } = {}) {
  const entityTerms = new Set(terms(entity.name));
  if (entityTerms.size === 0) return null;
  for (const [id, cfg] of Object.entries(config || {})) {
    if (!mentionsCountry(cfg, entity.country)) continue;
    const configTerms = new Set([
      ...terms((cfg.keywords || []).join(' ')),
      ...terms((cfg.strictKeywords || []).join(' ')),
    ]);
    let shared = 0;
    for (const t of entityTerms) {
      if (configTerms.has(t)) shared += 1;
      if (shared >= minShared) return id;
    }
  }
  return null;
}
