// The coverage overview: a plain-language description of what this archive
// holds on a movement, composed from the aggregated numbers rather than
// written by hand.
//
// Everything here is derived, so it cannot go stale and it cannot assert
// anything the data does not already show. Claims about the movement itself
// — what happened, who is involved, what they want — belong in the curated
// brief, which a person writes and this never touches.

import { longDate, periodLabel } from '@/lib/dates';
import { movementHeading } from '@/lib/seo';
import type { Movement, MovementStats, Status } from '@/lib/types';

// How the status badge is arrived at, phrased for a reader rather than
// restating the thresholds. Mirrors computeStatus in scripts/aggregate.mjs.
const STATUS_SENTENCE: Record<Status, string> = {
  Escalating:
    'It is marked escalating, which this archive assigns when the past two days carry a sharp rise against the preceding fortnight.',
  Active: 'It is marked active, meaning new reporting arrived within the past week.',
  Quiet: 'It is marked quiet: reporting arrived within the past month, but not the past week.',
  Dormant: 'It is marked dormant, with no reporting logged in the past month.',
  Concluded:
    'It is marked concluded — the one status set by hand, because an outcome that closes a story is not something an article count can infer.',
};

function list(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function coverageSummary(movement: Movement, stats: MovementStats): string {
  const heading = movementHeading(movement.name, movement.location);
  const sentences: string[] = [];

  if (stats.firstDate && stats.lastDate && movement.articleCount > 0) {
    sentences.push(
      `This page collects ${movement.articleCount} reports on the ${heading}, filed by ` +
        `${stats.sources.length} outlets between ${longDate(stats.firstDate)} and ` +
        `${longDate(stats.lastDate)}.`,
    );
  } else {
    sentences.push(`No coverage has been logged for the ${heading} yet.`);
  }

  const peak = stats.buckets.reduce(
    (best, b) => (b.count > (best?.count ?? -1) ? b : best),
    stats.buckets[0],
  );
  if (peak && peak.count > 1) {
    sentences.push(
      `Reporting was heaviest in ${periodLabel(peak.start, stats.granularity)}, when ` +
        `${peak.count} articles were logged.`,
    );
  }

  const top = stats.sources.slice(0, 3).map((s) => s.name);
  if (top.length > 1) {
    sentences.push(`${list(top)} have filed most often.`);
  }

  sentences.push(STATUS_SENTENCE[movement.status]);

  return sentences.join(' ');
}
