// Date helpers for the feed and metadata. All parsing is tolerant of
// "YYYY-MM-DD" and full ISO strings. Formatting uses a fixed style so
// build output is deterministic and locale-independent.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type DateLike = string | number | Date;

function toDate(value: DateLike): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Treat a bare date as local midday to avoid timezone off-by-one.
    return new Date(`${value}T12:00:00`);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// A compact mono date key, e.g. "2026.07.22" — used for sticky feed headers.
export function dateStamp(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// A long human label, e.g. "22 July 2026".
export function longDate(value: DateLike): string {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// A relative "time ago" label. `now` is injectable for testing.
export function timeAgo(value: DateLike, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return '';
  const secs = Math.round((now.getTime() - d.getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
}

export interface DateGroup<T> {
  key: string;
  date: DateLike;
  items: T[];
}

// Group feed items by their calendar day, newest day first, preserving
// the incoming (newest-first) order within each day. Returns an array of
// { key, date, items } so consumers can render sticky date headers.
export function groupByDate<T>(
  items: T[],
  getDate: (x: T) => DateLike = (x) => (x as unknown as { date: string }).date,
): DateGroup<T>[] {
  const groups = new Map<string, DateGroup<T>>();
  for (const item of items) {
    const raw = getDate(item);
    const key = dateStamp(raw);
    if (!groups.has(key)) {
      groups.set(key, { key, date: raw, items: [] });
    }
    groups.get(key)!.items.push(item);
  }
  return Array.from(groups.values()).sort((a, b) => {
    const da = toDate(a.date)?.getTime() ?? 0;
    const db = toDate(b.date)?.getTime() ?? 0;
    return db - da;
  });
}
