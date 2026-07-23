// Client-side data access. All content is fetched at runtime from
// /public/data so the aggregation script can overwrite JSON without a
// rebuild. The site is served from the domain root (custom domain), so
// data lives at absolute path /data/...

import type {
  Article,
  BackgroundBlock,
  LegalCase,
  MovementsIndex,
  Source,
  TimelineEvent,
} from '@/lib/types';

const BASE = '/data';

// Fetch and parse a JSON file under /public/data. Returns null on any
// failure (missing file, network error, bad JSON) so callers can render
// a "not compiled" / empty state for archived movements with no data.
export async function fetchJSON<T>(path: string): Promise<T | null> {
  const url = `${BASE}/${path}`.replace(/\/{2,}/g, '/');
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Global movement index.
export async function fetchMovements(): Promise<MovementsIndex> {
  const data = await fetchJSON<MovementsIndex>('movements.json');
  if (!data || !Array.isArray(data.movements)) {
    return { lastUpdated: null, movements: [] };
  }
  return data;
}

// Per-movement curated / feed files. Each returns a sensible empty shape
// on failure so pages can distinguish "no data" from "still loading".
export async function fetchArticles(id: string): Promise<Article[]> {
  const data = await fetchJSON<{ articles?: Article[] }>(`${id}/articles.json`);
  return Array.isArray(data?.articles) ? data!.articles : [];
}

export async function fetchTimeline(id: string): Promise<TimelineEvent[]> {
  const data = await fetchJSON<{ events?: TimelineEvent[] }>(`${id}/timeline.json`);
  return Array.isArray(data?.events) ? data!.events : [];
}

export async function fetchBackground(id: string): Promise<BackgroundBlock[]> {
  const data = await fetchJSON<{ blocks?: BackgroundBlock[] }>(`${id}/background.json`);
  return Array.isArray(data?.blocks) ? data!.blocks : [];
}

export async function fetchLegal(id: string): Promise<LegalCase[]> {
  const data = await fetchJSON<{ cases?: LegalCase[] }>(`${id}/legal.json`);
  return Array.isArray(data?.cases) ? data!.cases : [];
}

export async function fetchSources(id: string): Promise<Source[]> {
  const data = await fetchJSON<{ sources?: Source[] }>(`${id}/sources.json`);
  return Array.isArray(data?.sources) ? data!.sources : [];
}
