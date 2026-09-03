// The graduation bar is the whole quality mechanism for Tier 2. GDELT's own
// relevance is weak, so what makes a cluster worth proposing is that several
// independent outlets covered it across several days.
//
// "Independent" is doing real work here: syndication is collapsed upstream in
// cluster.mjs, because one wire story on five domains is one source, not five.

// Non-news sources seen in live probes: case-law databases and opinion
// aggregators surface on protest queries but are not coverage.
export const DENYLIST = new Set([
  'indiankanoon.org',
  'casemine.com',
  'lawyersclubindia.com',
  'pjmedia.com',
  'freerepublic.com',
  'zerohedge.com',
  'beforeitsnews.com',
]);

export function isDeniedDomain(domain) {
  return DENYLIST.has(String(domain || '').toLowerCase().replace(/^www\./, ''));
}

export function isGraduated(cluster, { minDomains = 3, minDays = 3 } = {}) {
  const domains = new Set((cluster.domains || []).filter((d) => !isDeniedDomain(d)));
  const days = new Set(cluster.daysSeen || []);
  return domains.size >= minDomains && days.size >= minDays;
}

function titleCase(s) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Clusters have no name. Synthesize a placeholder from the country and the
// two most distinctive terms, and flag it so a reviewer renames it.
export function clusterToEntity(cluster) {
  const topic = titleCase((cluster.terms || []).slice(0, 2).join(' '));
  const name = topic ? `${cluster.country} ${topic} protests` : `${cluster.country} protests`;
  return {
    qid: cluster.id,
    name,
    description: '',
    wikipedia: '',
    countries: [cluster.country],
    country: cluster.country,
    needsName: true,
  };
}
