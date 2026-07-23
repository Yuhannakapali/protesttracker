// The five movement statuses, their meanings, and ordering.
// Status is never hand-set in the UI; it comes from movements.json,
// which is produced by scripts/aggregate.mjs. Colors are applied via
// CSS variables defined per theme in styles/globals.css.

import type { Status } from '@/lib/types';

export const STATUSES: Status[] = ['Active', 'Escalating', 'Quiet', 'Dormant', 'Concluded'];

export const ACTIVE_STATUSES: Status[] = ['Active', 'Escalating'];

export const STATUS_MEANINGS: Record<Status, string> = {
  Active: 'Steady ongoing coverage.',
  Escalating: 'Sharp sustained rise in article volume.',
  Quiet: 'Still developing, but coverage has slowed.',
  Dormant: 'No significant activity for an extended period.',
  Concluded: 'Movement ended or resolved.',
};

// Maps a status to the CSS-variable slug used for its badge colors.
export function statusSlug(status: string): string {
  return String(status || '').toLowerCase();
}

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(status);
}
