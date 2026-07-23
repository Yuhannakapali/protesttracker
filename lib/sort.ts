import type { Movement } from '@/lib/types';

// A sortable recency key for a movement: the date of its newest headline,
// falling back to when it was logged. Used to order Home "most recent".
export function recencyKey(m: Movement): number {
  const head = m.latestHeadlines?.[0]?.date;
  const raw = head || m.logged;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function byRecencyDesc(a: Movement, b: Movement): number {
  return recencyKey(b) - recencyKey(a);
}
