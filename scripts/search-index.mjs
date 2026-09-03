#!/usr/bin/env node
// Generates the search index covering every article on the site, live and
// archived, as two files:
//
//   public/data/search-index.json   what matching needs
//   public/data/search-urls.json    the hrefs, in the same order
//
// They are split because most articles reach us through Google News, whose
// opaque article ids average ~390 bytes — three quarters of a combined file,
// none of it searchable. The header dropdown never loads the URLs at all,
// and the search page fetches them only once a query has hits.
//
// Runs as part of the `prebuild` step, after aggregation refreshes
// public/data. The output is generated, not committed.
//
// Records are tuples rather than objects: with a few thousand articles, the
// repeated keys of an object form cost more than the data. lib/search.ts
// holds the matching decoder — change one and you must change the other.
//
//   [movementIndex, title, source, date, excerpt?]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'public', 'data');
const OUT = path.join(DATA, 'search-index.json');
const OUT_URLS = path.join(DATA, 'search-urls.json');

// Long excerpts are what would blow the file up, and a match deep inside one
// is not what a reader is scanning for anyway.
const EXCERPT_CHARS = 160;

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function main() {
  const { movements = [] } = readJSON(path.join(DATA, 'movements.json'), {});
  const items = [];
  const urls = [];

  movements.forEach((m, i) => {
    const seen = new Set();
    const lists = [
      readJSON(path.join(DATA, m.id, 'articles.json'), {}).articles || [],
      readJSON(path.join(DATA, m.id, 'articles-archive.json'), {}).articles || [],
    ];
    for (const list of lists) {
      for (const a of list) {
        if (!a?.title || !a?.url || seen.has(a.url)) continue;
        seen.add(a.url);
        const row = [i, a.title, a.source || '', a.date || '', a.url];
        if (a.excerpt) row.push(a.excerpt.slice(0, EXCERPT_CHARS));
        items.push(row);
      }
    }
  });

  // Newest first, so an unfiltered or heavily-matched query still leads with
  // current coverage. The URL list is split off only after this sort, which
  // is what keeps the two files in step.
  items.sort((x, y) => (x[3] < y[3] ? 1 : x[3] > y[3] ? -1 : 0));
  for (const row of items) urls.push(row.splice(4, 1)[0]);

  const index = {
    generated: new Date().toISOString(),
    movements: movements.map((m) => ({
      id: m.id,
      name: m.name,
      location: m.location || '',
      description: m.description || '',
    })),
    items,
  };

  fs.writeFileSync(OUT, JSON.stringify(index));
  fs.writeFileSync(OUT_URLS, JSON.stringify(urls));
  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
  console.log(
    `Wrote search index: ${items.length} articles (${kb(OUT)} KB) + urls (${kb(OUT_URLS)} KB).`,
  );
}

main();
