#!/usr/bin/env node
// Generates the Open Graph card for every page that has one:
//
//   public/og/default.png        the site card
//   public/og/<movement>.png     one per movement
//
// Runs as part of the `prebuild` step. The output is generated, not
// committed. Never fails the build — a card that cannot be written just
// falls back to the default one in the page head.
//
// The cards are drawn as SVG and rasterised with sharp. Font availability
// differs between a laptop and a CI runner, so every family is given a
// Linux-side fallback; the layout is sized so a substituted face still fits.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'public', 'data');
const OUT_DIR = path.join(ROOT, 'public', 'og');

// The size every social platform crops from.
const W = 1200;
const H = 630;
const PAD = 80;

const INK = '#f5f2ec';
const INK_DIM = '#9a938a';
const GROUND = '#1a1a19';
const ACCENT = '#e0664e';

const SERIF = "Newsreader, Georgia, 'DejaVu Serif', 'Liberation Serif', serif";
const MONO = "'IBM Plex Mono', 'DejaVu Sans Mono', 'Liberation Mono', monospace";

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Greedy wrap on an estimated advance width. Measured against Newsreader at
// 0.54 em per character; the factor is set above that so a wider substituted
// face on a CI runner still stops short of the margin.
function wrap(text, fontSize, maxWidth) {
  const perChar = fontSize * 0.6;
  const limit = Math.floor(maxWidth / perChar);
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > limit && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function card({ eyebrow, title, meta }) {
  // Long names step down a size rather than overflowing the card.
  const size = title.length > 46 ? 62 : title.length > 30 ? 74 : 86;
  const lines = wrap(title, size, W - PAD * 2).slice(0, 3);
  const blockHeight = lines.length * size * 1.16;
  const top = (H - blockHeight) / 2 + size * 0.9;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${GROUND}"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${ACCENT}"/>
  <rect x="${PAD}" y="${PAD}" width="26" height="26" rx="5" fill="${ACCENT}"/>
  <text x="${PAD + 44}" y="${PAD + 21}" font-family="${SERIF}" font-size="27" font-weight="600" fill="${INK}">ProtestTracker</text>
  <text x="${W - PAD}" y="${PAD + 21}" text-anchor="end" font-family="${MONO}" font-size="17" letter-spacing="2" fill="${INK_DIM}">${escapeXml(eyebrow)}</text>
${lines
  .map(
    (line, i) =>
      `  <text x="${PAD}" y="${top + i * size * 1.16}" font-family="${SERIF}" font-size="${size}" font-weight="600" fill="${INK}">${escapeXml(line)}</text>`,
  )
  .join('\n')}
  <rect x="${PAD}" y="${H - PAD - 46}" width="64" height="3" fill="${ACCENT}"/>
  <text x="${PAD}" y="${H - PAD}" font-family="${MONO}" font-size="21" fill="${INK_DIM}">${escapeXml(meta)}</text>
</svg>`;
}

async function write(file, svg) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { movements = [] } = readJSON(path.join(DATA, 'movements.json'), {});

  const total = movements.reduce((n, m) => n + (m.articleCount || 0), 0);
  await write(
    path.join(OUT_DIR, 'default.png'),
    card({
      eyebrow: 'INDEPENDENT NEWS ARCHIVE',
      title: 'A live archive of global protest movements',
      meta: `${movements.length} movements · ${total.toLocaleString('en-US')} sourced reports`,
    }),
  );

  for (const m of movements) {
    // Country first, matching the page title: it is the word people search.
    const country = (m.location || '').split('·')[0].trim();
    const title = country && !m.name.toLowerCase().includes(country.toLowerCase())
      ? `${country} ${m.name}`
      : m.name;
    await write(
      path.join(OUT_DIR, `${m.id}.png`),
      card({
        eyebrow: (m.status || '').toUpperCase(),
        title,
        meta: `${m.location} · ${m.articleCount} sourced reports`,
      }),
    );
  }

  console.log(`Wrote ${movements.length + 1} Open Graph cards.`);
}

main().catch((err) => {
  console.warn(`OG card generation skipped: ${err.message}`);
});
