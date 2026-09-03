// Keeps discovery from re-proposing a movement the archive already covers.
// Country-gated so a shared topic word ("finance bill") cannot match a
// movement on another continent.

const GENERIC = new Set([
  'protest', 'protests', 'demonstration', 'demonstrations', 'rally', 'rallies',
  'strike', 'strikes', 'march', 'marches', 'riot', 'riots', 'unrest', 'clashes',
  'the', 'of', 'in', 'at', 'and', 'against',
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

export function findTrackedMatch(entity, config) {
  const entityTerms = new Set(terms(entity.name));
  if (entityTerms.size === 0) return null;
  for (const [id, cfg] of Object.entries(config || {})) {
    if (!mentionsCountry(cfg, entity.country)) continue;
    const configTerms = new Set([
      ...terms((cfg.keywords || []).join(' ')),
      ...terms((cfg.strictKeywords || []).join(' ')),
    ]);
    for (const t of entityTerms) {
      if (configTerms.has(t)) return id;
    }
  }
  return null;
}
