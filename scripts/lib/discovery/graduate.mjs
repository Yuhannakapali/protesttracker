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

// Three bars, all necessary:
//   domains  - several outlets carried it
//   days     - it persisted rather than flashing once
//   stories  - several DISTINCT reports, not one wire story syndicated widely.
// The third is not redundant: collapseSyndication folds identical titles into
// a single story but keeps every domain it appeared on, so without a story
// bar one republished article would clear the outlet bar by itself.
export function isGraduated(cluster, { minDomains = 3, minDays = 3, minStories = 3 } = {}) {
  const domains = new Set((cluster.domains || []).filter((d) => !isDeniedDomain(d)));
  const days = new Set(cluster.daysSeen || []);
  const stories = cluster.articleCount || 0;
  return domains.size >= minDomains && days.size >= minDays && stories >= minStories;
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
