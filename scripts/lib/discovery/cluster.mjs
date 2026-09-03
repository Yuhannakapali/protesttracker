// Groups articles into candidate movements. Country-gated so a topic word
// cannot merge protests on two continents, and matched on distinctive-term
// overlap so "police" and "government" cannot glue the corpus together.
//
// Clusters persist in discovery/state.json across runs — "sustained across
// days" is only measurable with memory of previous runs. Sets are stored as
// arrays so the state file stays plain JSON.

const DAY_MS = 24 * 60 * 60 * 1000;

// Overlap COUNT, not ratio. Jaccard was measured and rejected: on 241 real
// stories it graduated zero clusters at >=0.4 (and zero at 0.3), because it
// penalizes set-size differences — two outlets covering one protest carry
// ~8 terms each and share 2-3, scoring ~0.2. Shared-count graduated 5.
export function sharedTermCount(a, b) {
  const B = b instanceof Set ? b : new Set(b);
  let n = 0;
  for (const t of new Set(a)) if (B.has(t)) n += 1;
  return n;
}

// One wire story republished across domains is not multi-outlet corroboration.
// Identical normalized titles collapse into a single story carrying every
// domain and day it appeared under. Mirrors normTitle() in aggregate.mjs.
function normTitle(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function collapseSyndication(articles) {
  const byTitle = new Map();
  for (const a of articles) {
    const k = normTitle(a.title);
    if (!k) continue;
    const hit = byTitle.get(k);
    if (!hit) {
      byTitle.set(k, { ...a, domains: [a.domain], days: [a.date] });
    } else {
      if (!hit.domains.includes(a.domain)) hit.domains.push(a.domain);
      if (!hit.days.includes(a.date)) hit.days.push(a.date);
    }
  }
  return [...byTitle.values()];
}

export function clusterKey(article) {
  const stem = [...article.terms].sort().slice(0, 3).join('-') || 'untitled';
  return `${article.country}:${stem}`.toLowerCase().replace(/[^a-z0-9:-]+/g, '-');
}

function seed(article) {
  return {
    id: clusterKey(article),
    country: article.country,
    terms: [...article.terms],
    domains: [...(article.domains || [article.domain])],
    daysSeen: [...(article.days || [article.date])],
    articleCount: 1,
    firstSeen: article.date,
    lastSeen: article.date,
    samples: [{ title: article.title, url: article.url, domain: article.domain, date: article.date }],
  };
}

function absorb(cluster, article) {
  cluster.terms = [...new Set([...cluster.terms, ...article.terms])];
  for (const d of article.domains || [article.domain]) {
    if (!cluster.domains.includes(d)) cluster.domains.push(d);
  }
  for (const d of article.days || [article.date]) {
    if (!cluster.daysSeen.includes(d)) cluster.daysSeen.push(d);
  }
  cluster.articleCount += 1;
  if (article.date < cluster.firstSeen) cluster.firstSeen = article.date;
  if (article.date > cluster.lastSeen) cluster.lastSeen = article.date;
  if (cluster.samples.length < 5) {
    cluster.samples.push({ title: article.title, url: article.url, domain: article.domain, date: article.date });
  }
  return cluster;
}

export function assignToClusters(articles, clusters, { minShared = 2 } = {}) {
  const out = { ...clusters };
  for (const article of articles) {
    if (!article.terms || article.terms.length === 0) continue;
    let bestId = null;
    let bestScore = 0;
    for (const [id, c] of Object.entries(out)) {
      if (c.country !== article.country) continue;
      const score = sharedTermCount(article.terms, c.terms);
      if (score >= minShared && score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (bestId) {
      out[bestId] = absorb({ ...out[bestId] }, article);
    } else {
      const c = seed(article);
      // A key collision with a different topic is possible; suffix it.
      let id = c.id;
      let n = 2;
      while (out[id]) { id = `${c.id}-${n}`; n += 1; }
      out[id] = { ...c, id };
    }
  }
  return out;
}

export function evictStale(clusters, nowMs, { maxIdleDays = 21 } = {}) {
  const out = {};
  for (const [id, c] of Object.entries(clusters || {})) {
    const last = Date.parse(`${c.lastSeen}T00:00:00Z`);
    if (Number.isNaN(last) || nowMs - last <= maxIdleDays * DAY_MS) out[id] = c;
  }
  return out;
}
