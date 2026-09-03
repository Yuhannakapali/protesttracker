// Region grouping. Regions are whatever the movement data says they are —
// deriving the list rather than hardcoding it means a new region appears as
// a page the moment a movement is filed under it.

import type { Movement } from '@/lib/types';

export function regionSlug(region: string): string {
  return region.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function regionsOf(movements: Movement[]): string[] {
  return Array.from(new Set(movements.map((m) => m.region).filter(Boolean))).sort();
}
