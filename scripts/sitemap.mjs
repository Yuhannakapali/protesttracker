#!/usr/bin/env node
// Generates public/sitemap.xml from the aggregated movement index.
//
// Runs as the `prebuild` npm lifecycle step, so it happens after the
// aggregation script has refreshed public/data and before `next build`
// copies public/ into the export. The output is generated, not committed.
//
// Uses only Node built-ins. Never fails the build: a missing or unreadable
// movements.json yields a sitemap of just the static pages.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MOVEMENTS = path.join(ROOT, 'public', 'data', 'movements.json');
const OUT = path.join(ROOT, 'public', 'sitemap.xml');

const SITE_URL = 'https://protesttracker.net';

// next.config.js sets trailingSlash: true, so every URL here needs one.
// Without it each entry would point at a redirect.
const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'hourly' },
  { path: '/archive/', priority: '0.8', changefreq: 'daily' },
  { path: '/search/', priority: '0.5', changefreq: 'daily' },
  { path: '/about/', priority: '0.3', changefreq: 'monthly' },
];

function readMovements() {
  try {
    const raw = JSON.parse(fs.readFileSync(MOVEMENTS, 'utf8'));
    return { movements: raw.movements || [], lastUpdated: raw.lastUpdated || null };
  } catch {
    return { movements: [], lastUpdated: null };
  }
}

// A movement's freshness is the date of its newest headline, falling back to
// the index's own timestamp.
function lastmodFor(movement, fallback) {
  const newest = movement.latestHeadlines?.[0]?.date;
  const raw = newest || movement.logged || fallback;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  const parts = [`    <loc>${loc}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

function main() {
  const { movements, lastUpdated } = readMovements();
  const indexDate = lastUpdated ? lastUpdated.slice(0, 10) : null;

  const entries = [
    ...STATIC_PAGES.map((p) =>
      urlEntry({
        loc: `${SITE_URL}${p.path}`,
        lastmod: indexDate,
        changefreq: p.changefreq,
        priority: p.priority,
      }),
    ),
    // One hub per region present in the data, matching pages/regions/[region].
    ...Array.from(new Set(movements.map((m) => m.region).filter(Boolean)))
      .sort()
      .map((region) =>
        urlEntry({
          loc: `${SITE_URL}/regions/${region
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')}/`,
          lastmod: indexDate,
          changefreq: 'daily',
          priority: '0.7',
        }),
      ),
    ...movements.map((m) =>
      urlEntry({
        loc: `${SITE_URL}/movements/${m.id}/`,
        lastmod: lastmodFor(m, lastUpdated),
        changefreq: m.active ? 'hourly' : 'monthly',
        priority: m.active ? '0.9' : '0.6',
      }),
    ),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${entries.join('\n')}\n` +
    '</urlset>\n';

  fs.writeFileSync(OUT, xml);
  console.log(`Wrote sitemap.xml with ${entries.length} urls.`);
}

main();
