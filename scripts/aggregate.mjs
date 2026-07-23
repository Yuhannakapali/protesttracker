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
const MAX_ARTICLES = 500;
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

function stripHtml(str) {
  if (!str) return '';
  return decodeEntities(String(str).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
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

function parseRss(xml) {
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
    const description = stripHtml(tag(block, 'description'));
    const sourceTag = stripHtml(tag(block, 'source'));

    const split = splitTitleSource(rawTitle);
    const source = sourceTag || split.source || 'Unknown';
    // Always drop the trailing " - Publisher" suffix Google News appends.
    const title = split.title;
    const date = toISODate(pubDate);

    if (!title || !link) continue;
    items.push({
      title,
      source,
      url: link,
      date: date || toISODate(new Date().toISOString()),
      excerpt: description.slice(0, 240),
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
    const existingArticles = readJson(articlesPath, { articles: [] }).articles || [];

    let okFeeds = 0;
    let failedFeeds = 0;
    const fetched = [];

    for (const url of cfg.feeds || []) {
      try {
        const xml = await fetchFeed(url);
        const items = parseRss(xml).filter((a) => matchesKeywords(a, cfg.keywords));
        fetched.push(...items);
        okFeeds += 1;
      } catch (err) {
        failedFeeds += 1;
        console.warn(`  [${id}] feed failed: ${url}\n    ${err.message}`);
      }
    }

    const merged = sortNewestFirst(dedupe([...fetched, ...existingArticles])).slice(0, MAX_ARTICLES);
    writeJson(articlesPath, { articles: merged });

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
      `[${id}] feeds ok:${okFeeds} failed:${failedFeeds} | +${fetched.length} fetched | ${merged.length} total | status:${status}`,
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
