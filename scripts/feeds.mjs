#!/usr/bin/env node
// Generates RSS 2.0 and JSON Feed files from the aggregated data.
//
//   public/feed.xml                     latest across every movement
//   public/feed.json
//   public/movements/<id>/feed.xml      one movement
//   public/movements/<id>/feed.json
//
// Runs as part of the `prebuild` step, after aggregation refreshes
// public/data and before `next build` copies public/ into the export.
// The output is generated, not committed.
//
// Uses only Node built-ins. Never fails the build: unreadable data yields
// an empty feed rather than a broken deploy.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'public', 'data');
const PUBLIC = path.join(ROOT, 'public');

const SITE_URL = 'https://protesttracker.net';
const SITE_NAME = 'ProtestTracker';
const SITE_DESCRIPTION =
  'A running record of protest movements, assembled from public news coverage.';

// Enough for a reader to catch up after a few days away without turning the
// feed into a full archive dump.
const SITE_ITEMS = 60;
const MOVEMENT_ITEMS = 50;

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Dates in the data are day-precision (YYYY-MM-DD). RFC 822 wants a time, so
// anchor at midday UTC — closer to the truth than midnight in either
// direction, and it stops a reader in a western timezone showing yesterday.
function rfc822(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toUTCString();
}

function rfc3339(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function rssItem(a) {
  const parts = [
    `      <title>${escapeXml(a.title)}</title>`,
    `      <link>${escapeXml(a.url)}</link>`,
    // The article lives on the publisher's site, so its URL is the only
    // stable identity we have; isPermaLink says so explicitly.
    `      <guid isPermaLink="true">${escapeXml(a.url)}</guid>`,
    // RSS's own <source> means "the feed this item came from", not the
    // publisher, so the outlet goes in dc:creator where readers look for it.
    `      <dc:creator>${escapeXml(a.source)}</dc:creator>`,
  ];
  if (a.movement) parts.push(`      <category>${escapeXml(a.movement)}</category>`);
  const pub = rfc822(a.date);
  if (pub) parts.push(`      <pubDate>${pub}</pubDate>`);
  if (a.excerpt) parts.push(`      <description>${escapeXml(a.excerpt)}</description>`);
  return `    <item>\n${parts.join('\n')}\n    </item>`;
}

function rss({ title, description, feedPath, pagePath, items }) {
  const body = items.map(rssItem).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '  <channel>\n' +
    `    <title>${escapeXml(title)}</title>\n` +
    `    <link>${SITE_URL}${pagePath}</link>\n` +
    `    <description>${escapeXml(description)}</description>\n` +
    '    <language>en</language>\n' +
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n` +
    `    <atom:link href="${SITE_URL}${feedPath}" rel="self" type="application/rss+xml" />\n` +
    (body ? `${body}\n` : '') +
    '  </channel>\n' +
    '</rss>\n'
  );
}

function jsonFeed({ title, description, feedPath, pagePath, items }) {
  return `${JSON.stringify(
    {
      version: 'https://jsonfeed.org/version/1.1',
      title,
      description,
      home_page_url: `${SITE_URL}${pagePath}`,
      feed_url: `${SITE_URL}${feedPath}`,
      language: 'en',
      items: items.map((a) => ({
        id: a.url,
        url: a.url,
        title: a.title,
        content_text: a.excerpt || a.title,
        date_published: rfc3339(a.date) || undefined,
        authors: [{ name: a.source }],
        tags: a.movement ? [a.movement] : undefined,
      })),
    },
    null,
    2,
  )}\n`;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function writeFeed(dir, meta) {
  write(path.join(dir, 'feed.xml'), rss(meta));
  write(path.join(dir, 'feed.json'), jsonFeed(meta));
}

// Newest first, and only articles complete enough for a reader to act on.
function sortArticles(articles) {
  return articles
    .filter((a) => a && a.title && a.url && a.date)
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
}

function main() {
  const { movements = [] } = readJSON(path.join(DATA, 'movements.json'), {});
  const everything = [];

  for (const m of movements) {
    const { articles = [] } = readJSON(path.join(DATA, m.id, 'articles.json'), {});
    const sorted = sortArticles(articles);
    for (const a of sorted.slice(0, SITE_ITEMS)) everything.push({ ...a, movement: m.name });

    writeFeed(path.join(PUBLIC, 'movements', m.id), {
      title: `${m.name} · ${SITE_NAME}`,
      description: m.description || SITE_DESCRIPTION,
      feedPath: `/movements/${m.id}/feed.xml`,
      pagePath: `/movements/${m.id}/`,
      items: sorted.slice(0, MOVEMENT_ITEMS),
    });
  }

  // Each movement contributes at most SITE_ITEMS, so one busy movement can
  // still fill the site feed on a heavy news day — but it cannot do so with
  // stale entries, since every candidate is that movement's newest.
  const site = sortArticles(everything).slice(0, SITE_ITEMS);
  writeFeed(PUBLIC, {
    title: `${SITE_NAME} · Latest coverage`,
    description: SITE_DESCRIPTION,
    feedPath: '/feed.xml',
    pagePath: '/',
    items: site,
  });

  console.log(`Wrote feeds: 1 site (${site.length} items) + ${movements.length} movements.`);
}

main();
