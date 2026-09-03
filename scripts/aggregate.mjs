#!/usr/bin/env node
// ProtestTracker aggregation script.
//
// For each movement in scripts/movements.config.json:
//   1. Fetch each RSS feed (fail per-feed, never crash the run).
//   2. Normalize items to { title, source, url, date, excerpt }.
//   3. Keyword-filter, dedupe (by url and near-identical title).
//   4. Merge with existing articles.json, sort newest-first, cap 500.
//   5. Compute status from article recency / volume (manualStatus wins).
//   6. Rewrite each articles.json and regenerate movements.json.
//
// It NEVER touches timeline/background/legal/sources files. Uses only Node
// built-ins (Node 18+ global fetch). Exit 0 even if some feeds failed;
// non-zero only on a fatal error (e.g. config unreadable).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const CONFIG_PATH = path.join(__dirname, 'movements.config.json');

const FEED_TIMEOUT_MS = 15000;
// The live feed keeps the most recent slice; everything older moves to
// articles-archive.json rather than being discarded. The previous single
// 500-article cap silently deleted history — india-cjp had already lost
// roughly three months of its own record to it.
const FEED_ARTICLES = 250;
const EXCERPT_MAX_CHARS = 320;
const USER_AGENT =
  'Mozilla/5.0 (compatible; ProtestTrackerBot/1.0; +https://protesttracker.net)';

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

// ---- Text helpers ---------------------------------------------------------

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 16));
      } catch {
        return '';
      }
    });
}

// Order matters: decode entities FIRST, then strip tags. Google News puts
// entity-encoded markup in <description> ("&lt;a href=...&gt;"), so stripping
// first removes nothing and the later decode turns that markup into visible
// text. Decoding twice covers feeds that double-encode.
function stripHtml(str) {
  if (!str) return '';
  const decoded = decodeEntities(String(str));
  let out = decodeEntities(decoded.replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ');
  // A tag left unterminated by an earlier truncation ('<a href="https://…'
  // cut at 240 chars) never matches the tag pattern, so remove a dangling
  // fragment at either end explicitly.
  out = out.replace(/<[^>]*$/, ' ').replace(/^[^<>]*>/, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

// True when an "excerpt" carries nothing the headline does not already say.
// Google News descriptions are just the linked headline plus the publisher
// name, so once cleaned they are pure duplication — worth nothing to a reader
// and actively bad on the page as repeated text.
function isEchoOfTitle(excerpt, title, source) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const e = norm(excerpt);
  const t = norm(title);
  if (!e) return true;
  if (!t) return false;
  if (e === t) return true;
  if (!e.startsWith(t)) return false;
  const rest = e.slice(t.length).trim();
  return rest === '' || rest === norm(source);
}

// Clean an excerpt and drop it if it adds nothing. Applied to freshly fetched
// items and, on every run, to already-stored ones so previously mangled
// excerpts repair themselves without a separate migration.
function normalizeExcerpt(raw, title, source) {
  const text = stripHtml(raw).slice(0, EXCERPT_MAX_CHARS);
  return isEchoOfTitle(text, title, source) ? '' : text;
}

// Extract CDATA or inner text of the first matching tag inside a block.
function tag(block, name) {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  const inner = m[1];
  const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : inner).trim();
}

function toISODate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Google News titles are often "Headline - Publisher". Split that off when
// no explicit <source> was provided.
function splitTitleSource(rawTitle) {
  const idx = rawTitle.lastIndexOf(' - ');
  if (idx > 0 && idx > rawTitle.length - 60) {
    return { title: rawTitle.slice(0, idx).trim(), source: rawTitle.slice(idx + 3).trim() };
  }
  return { title: rawTitle.trim(), source: '' };
}

// ---- RSS parsing (no external deps) --------------------------------------

// Turn "www.vanguardngr.com" into "vanguardngr.com" for use as a last-resort
// publisher label, when a feed gives neither a <source> tag nor a configured
// name.
// Google News search feeds are already scoped by their query, so items from
// them are on-topic by construction. Publisher feeds are site-wide and need a
// tighter filter — this tells the two apart, for stored articles as well as
// fresh ones.
function isGoogleNewsUrl(url) {
  return String(url || '').includes('news.google.com');
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function parseRss(xml, feedSource = '') {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const rawTitle = stripHtml(tag(block, 'title'));
    let link = stripHtml(tag(block, 'link'));
    if (!link) {
      // Some feeds put the url in <guid>.
      link = stripHtml(tag(block, 'guid'));
    }
    const pubDate = tag(block, 'pubDate');
    const description = tag(block, 'description');
    const sourceTag = stripHtml(tag(block, 'source'));

    const split = splitTitleSource(rawTitle);
    // Publisher feeds carry no <source> tag and no " - Publisher" title
    // suffix, so fall back to the name configured for the feed, then to the
    // link's hostname.
    const source = sourceTag || split.source || feedSource || hostLabel(link) || 'Unknown';
    // Always drop the trailing " - Publisher" suffix Google News appends.
    const title = split.title;
    const date = toISODate(pubDate);

    if (!title || !link) continue;
    items.push({
      title,
      source,
      url: link,
      date: date || toISODate(new Date().toISOString()),
      excerpt: normalizeExcerpt(description, title, source),
    });
  }
  return items;
}

async function fetchFeed(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---- Dedupe / filter ------------------------------------------------------

function normTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchesKeywords(article, keywords) {
  if (!keywords || keywords.length === 0) return true;
  const hay = `${article.title} ${article.excerpt}`.toLowerCase();
  return keywords.some((k) => hay.includes(String(k).toLowerCase()));
}

// Some topic phrases are live political terms in more than one country:
// "reforma previsional" is Argentine as often as Chilean, which filed 31
// AMSAFE (Santa Fe teachers' union) articles under a Chilean movement.
// excludeKeywords rejects an article outright, and is matched against the
// source and url too so a country's domains can be excluded wholesale.
function isExcluded(article, excludeKeywords) {
  if (!excludeKeywords || excludeKeywords.length === 0) return false;
  const hay = `${article.title} ${article.excerpt} ${article.source} ${article.url}`.toLowerCase();
  return excludeKeywords.some((k) => hay.includes(String(k).toLowerCase()));
}

function dedupe(articles) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const out = [];
  for (const a of articles) {
    const urlKey = a.url.split('?')[0];
    const titleKey = normTitle(a.title);
    if (seenUrl.has(urlKey) || (titleKey && seenTitle.has(titleKey))) continue;
    seenUrl.add(urlKey);
    if (titleKey) seenTitle.add(titleKey);
    out.push(a);
  }
  return out;
}

function sortNewestFirst(articles) {
  return articles.slice().sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    return db - da;
  });
}

// ---- Status computation ---------------------------------------------------

function computeStatus(articles, manualStatus) {
  if (manualStatus) return manualStatus;
  if (articles.length === 0) return 'Dormant';

  const times = articles.map((a) => new Date(a.date).getTime()).filter((t) => !Number.isNaN(t));
  const last7 = times.filter((t) => NOW - t <= 7 * DAY).length;
  const last30 = times.filter((t) => NOW - t <= 30 * DAY).length;
  const last48h = times.filter((t) => NOW - t <= 2 * DAY).length;
  const last14 = times.filter((t) => NOW - t <= 14 * DAY).length;
  const dailyAvg14 = last14 / 14;

  // Escalation: a sharp, sustained rise in the last 48h.
  if (dailyAvg14 > 0 && last48h >= 3 && last48h >= 3 * dailyAvg14) return 'Escalating';

  if (last7 > 0) return 'Active';
  if (last30 > 0) return 'Quiet';
  return 'Dormant';
}

function timeAgo(dateStr) {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const secs = Math.round((NOW - t) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return 'over a year ago';
}

// ---- Derived statistics ---------------------------------------------------

// Bucket boundaries: weekly reads well over a few months, monthly over years.
// A movement spanning 75 months would otherwise produce 325 weekly bars.
const WEEKLY_SPAN_LIMIT_DAYS = 120;

function isoDay(t) {
  return new Date(t).toISOString().slice(0, 10);
}

// Monday of the ISO week containing `t`.
function weekStart(t) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return isoDay(d);
}

function monthStart(t) {
  return `${new Date(t).toISOString().slice(0, 7)}-01`;
}

// Coverage volume over time plus a per-outlet roll-up. Both are derived from
// the article list alone, so they need no curation and stay correct as the
// corpus grows.
// One outlet reaches us under several labels: a feed says "NDTV", a bare
// Google News link falls back to "ndtv.com". Both collapse to the same key so
// the tally counts outlets rather than spellings.
const HOST_SHAPED = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

function isHostShaped(name) {
  return HOST_SHAPED.test(String(name).toLowerCase().trim());
}

function sourceKey(name) {
  let s = String(name).toLowerCase().trim().replace(/^www\./, '');
  if (isHostShaped(s)) {
    // Drop the public suffix ("ndtv.co.in" -> "ndtv"), never an inner word.
    s = s.replace(/\.[a-z]{2,4}(\.[a-z]{2})?$/, '').replace(/\./g, ' ');
  }
  return s.replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '') || s;
}

function buildStats(articles) {
  const times = articles
    .map((a) => ({ t: new Date(a.date).getTime(), a }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((x, y) => x.t - y.t);

  if (times.length === 0) {
    return { granularity: 'month', buckets: [], sources: [], firstDate: null, lastDate: null };
  }

  const spanDays = (times[times.length - 1].t - times[0].t) / DAY;
  const granularity = spanDays <= WEEKLY_SPAN_LIMIT_DAYS ? 'week' : 'month';
  const keyOf = granularity === 'week' ? weekStart : monthStart;

  // Count per bucket, then fill the gaps so a quiet stretch reads as a
  // trough rather than vanishing from the axis.
  const counts = new Map();
  for (const { t } of times) {
    const k = keyOf(t);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const buckets = [];
  const step = granularity === 'week' ? 7 : 0;
  const cursor = new Date(`${keyOf(times[0].t)}T00:00:00Z`);
  const end = new Date(`${keyOf(times[times.length - 1].t)}T00:00:00Z`);
  while (cursor <= end) {
    const k = isoDay(cursor);
    buckets.push({ start: k, count: counts.get(k) || 0 });
    if (step) cursor.setUTCDate(cursor.getUTCDate() + step);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const bySource = new Map();
  for (const { a } of times) {
    const name = a.source || 'Unknown';
    const key = sourceKey(name);
    const cur = bySource.get(key) || { name, count: 0, first: a.date, last: a.date };
    // Feeds spell the same outlet several ways; keep the most human label.
    if (isHostShaped(cur.name) && !isHostShaped(name)) cur.name = name;
    cur.count += 1;
    if (a.date < cur.first) cur.first = a.date;
    if (a.date > cur.last) cur.last = a.date;
    bySource.set(key, cur);
  }
  const sources = Array.from(bySource.values()).sort(
    (x, y) => y.count - x.count || x.name.localeCompare(y.name),
  );

  return {
    granularity,
    buckets,
    sources,
    firstDate: isoDay(times[0].t),
    lastDate: isoDay(times[times.length - 1].t),
  };
}

// ---- IO helpers -----------------------------------------------------------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const config = readJson(CONFIG_PATH, null);
  if (!config) {
    console.error(`FATAL: cannot read ${CONFIG_PATH}`);
    process.exit(1);
  }

  const existingIndex = readJson(path.join(DATA_DIR, 'movements.json'), { movements: [] });
  const existingById = new Map((existingIndex.movements || []).map((m) => [m.id, m]));

  // Optional CLI args: a list of movement ids to refresh. With none, all
  // configured movements are processed. Skipped movements keep their
  // existing movements.json entry so the index stays complete.
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

  const movements = [];

  for (const [id, cfg] of Object.entries(config)) {
    if (only.length && !only.includes(id)) {
      const kept = existingById.get(id);
      if (kept) movements.push(kept);
      console.log(`[${id}] skipped (not in requested id list)`);
      continue;
    }
    const dir = path.join(DATA_DIR, id);
    const articlesPath = path.join(dir, 'articles.json');
    const archivePath = path.join(dir, 'articles-archive.json');
    const existingArticles = [
      ...(readJson(articlesPath, { articles: [] }).articles || []),
      ...(readJson(archivePath, { articles: [] }).articles || []),
    ];
    // Falling back to `keywords` keeps a movement that defines no strict list
    // behaving exactly as before.
    const strictKeywords = cfg.strictKeywords || cfg.keywords;

    let okFeeds = 0;
    let failedFeeds = 0;
    const fetched = [];

    // A feed entry is either a bare url string or { url, source }. The
    // object form names the publisher for feeds that do not identify
    // themselves in the item markup.
    for (const entry of cfg.feeds || []) {
      const isPublisherFeed = typeof entry !== 'string';
      const url = isPublisherFeed ? entry.url : entry;
      const feedSource = isPublisherFeed ? entry.source || '' : '';
      if (!url) continue;
      // A publisher's site-wide feed carries its whole front page, so it is
      // filtered on strictKeywords — topic phrases only. A bare name like
      // "Tinubu" or "Ruto" is fine for a Google News query but would pull in
      // unrelated national politics here.
      const feedKeywords = isPublisherFeed ? strictKeywords : cfg.keywords;
      try {
        const xml = await fetchFeed(url);
        const items = parseRss(xml, feedSource)
          .filter((a) => matchesKeywords(a, feedKeywords))
          .filter((a) => !isExcluded(a, cfg.excludeKeywords));
        fetched.push(...items);
        okFeeds += 1;
      } catch (err) {
        failedFeeds += 1;
        console.warn(`  [${id}] feed failed: ${url}\n    ${err.message}`);
      }
    }

    // Re-normalise stored excerpts too, so articles saved before the
    // decode/strip order was fixed lose their mangled markup in place.
    const repaired = existingArticles
      .map((a) => ({
        ...a,
        excerpt: normalizeExcerpt(a.excerpt, a.title, a.source),
      }))
      // Hold stored publisher-feed articles to the same strict list applied on
      // the way in, so tightening it also clears entries admitted under a
      // looser one. Google News items keep their place.
      .filter((a) => isGoogleNewsUrl(a.url) || matchesKeywords(a, strictKeywords))
      // Exclusions are retroactive: adding one clears matching articles that
      // were stored before the rule existed.
      .filter((a) => !isExcluded(a, cfg.excludeKeywords));

    const merged = sortNewestFirst(dedupe([...fetched, ...repaired]));
    const feed = merged.slice(0, FEED_ARTICLES);
    const archived = merged.slice(FEED_ARTICLES);
    writeJson(articlesPath, { articles: feed });
    // Written even when empty, so the client can request it unconditionally
    // and get a valid empty response rather than a 404.
    writeJson(archivePath, { articles: archived });
    // Derived from the full record, not just the live slice.
    writeJson(path.join(dir, 'stats.json'), buildStats(merged));

    // Status and counts describe the whole record, not just the live slice.
    const status = computeStatus(merged, cfg.manualStatus);
    const active = status === 'Active' || status === 'Escalating';
    const prev = existingById.get(id) || {};
    const newest = merged[0]?.date || prev.logged || null;

    movements.push({
      id,
      // Prefer curated presentation fields already in movements.json; fall
      // back to config for brand-new movements.
      name: prev.name || cfg.name || id,
      status,
      active,
      region: prev.region || cfg.region || '',
      location: prev.location || cfg.location || '',
      year: prev.year || cfg.year || new Date().getFullYear(),
      logged: prev.logged || (merged.length ? merged[merged.length - 1].date : toISODate(new Date().toISOString())),
      articleCount: merged.length,
      updated: newest ? timeAgo(newest) : (prev.updated || 'unknown'),
      description: prev.description || cfg.description || '',
      latestHeadlines: merged.slice(0, 3).map((a) => ({ title: a.title, source: a.source, date: a.date })),
    });

    console.log(
      `[${id}] feeds ok:${okFeeds} failed:${failedFeeds} | +${fetched.length} fetched | ` +
        `${merged.length} total (${feed.length} feed + ${archived.length} archived) | status:${status}`,
    );
  }

  writeJson(path.join(DATA_DIR, 'movements.json'), {
    lastUpdated: new Date().toISOString(),
    movements,
  });

  console.log(`\nWrote movements.json with ${movements.length} movements.`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
