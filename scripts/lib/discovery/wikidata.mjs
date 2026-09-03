// Wikidata is the high-precision discovery tier: an item exists only because
// a human judged the protest notable enough to document, which is the
// sustained/multi-outlet bar already applied for us.

export const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// Q273120 = protest. P31/P279* walks subclasses; P580 = start time;
// P17 = country (multi-valued for solidarity protests abroad).
export function buildQuery(cutoffIso) {
  return `SELECT ?item ?itemLabel ?itemDescription ?article
       (GROUP_CONCAT(DISTINCT ?cl; separator=", ") AS ?countries) WHERE {
  ?item wdt:P31/wdt:P279* wd:Q273120 ; wdt:P580 ?start .
  FILTER(?start >= "${cutoffIso}"^^xsd:dateTime)
  OPTIONAL { ?item wdt:P17 ?c . ?c rdfs:label ?cl . FILTER(lang(?cl)="en") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,id,fr,pt,de,ar". }
} GROUP BY ?item ?itemLabel ?itemDescription ?article`;
}

const BARE_QID = /^Q\d+$/;

export function parseBindings(json) {
  const rows = json?.results?.bindings;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const qid = String(r.item?.value || '').split('/').pop() || '';
    const name = r.itemLabel?.value || qid;
    const countries = String(r.countries?.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      qid,
      name,
      description: r.itemDescription?.value || '',
      wikipedia: r.article?.value || '',
      countries,
      country: countries[0] || '',
      // A label the service could not resolve in any requested language comes
      // back as the Q-id itself. Keep the entity — a human can name it.
      needsName: BARE_QID.test(name),
    };
  });
}
