// Build-time data access. Mirrors lib/data.ts, but reads the JSON straight
// off disk inside getStaticProps instead of fetching it in the browser.
//
// Why both exist: the client fetch keeps a page current after it loads,
// while these readers put the same content into the prerendered HTML so
// crawlers (and users with JS disabled) see it at all. Pages seed their
// state from these props and then refresh from the network.
//
// This module must only ever be imported from getStaticProps/getStaticPaths
// — `node:fs` cannot be bundled for the browser.

import fs from 'node:fs';
import path from 'node:path';

import type {
  Article,
  BackgroundBlock,
  LegalCase,
  MovementsIndex,
  Source,
  TimelineEvent,
} from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

function readJson<T>(relativePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, relativePath), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function readMovements(): MovementsIndex {
  const data = readJson<MovementsIndex>('movements.json', { lastUpdated: null, movements: [] });
  return Array.isArray(data.movements) ? data : { lastUpdated: null, movements: [] };
}

export function readArticles(id: string): Article[] {
  return readJson<{ articles?: Article[] }>(`${id}/articles.json`, {}).articles || [];
}

export function readTimeline(id: string): TimelineEvent[] {
  return readJson<{ events?: TimelineEvent[] }>(`${id}/timeline.json`, {}).events || [];
}

export function readBackground(id: string): BackgroundBlock[] {
  return readJson<{ blocks?: BackgroundBlock[] }>(`${id}/background.json`, {}).blocks || [];
}

export function readLegal(id: string): LegalCase[] {
  return readJson<{ cases?: LegalCase[] }>(`${id}/legal.json`, {}).cases || [];
}

export function readSources(id: string): Source[] {
  return readJson<{ sources?: Source[] }>(`${id}/sources.json`, {}).sources || [];
}
