import { longDate } from '@/lib/dates';
import type { Movement, MovementStats } from '@/lib/types';

/**
 * The who/where/when/how-much block, derived entirely from data the
 * aggregator already produces. Nothing here is curated, so it cannot drift
 * out of date the way a hand-written paragraph does — and it is the shape
 * of answer an assistant or a featured snippet lifts cleanly.
 */
export default function KeyFacts({
  movement,
  stats,
}: {
  movement: Movement;
  stats: MovementStats;
}) {
  const peak = stats.buckets.reduce(
    (best, b) => (b.count > (best?.count ?? -1) ? b : best),
    stats.buckets[0],
  );

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Where', value: movement.location },
    { label: 'Status', value: `${movement.status}${movement.active ? ' — coverage ongoing' : ''}` },
    {
      label: 'Tracked since',
      value: <time dateTime={movement.logged}>{longDate(movement.logged)}</time>,
    },
  ];

  if (stats.lastDate) {
    facts.push({
      label: 'Latest report',
      value: <time dateTime={stats.lastDate}>{longDate(stats.lastDate)}</time>,
    });
  }
  facts.push({
    label: 'Coverage held',
    value: `${movement.articleCount} articles from ${stats.sources.length} outlets`,
  });
  if (peak && peak.count > 0) {
    facts.push({
      label: 'Busiest period',
      value: `${peak.count} articles in the ${stats.granularity} of ${longDate(peak.start)}`,
    });
  }

  return (
    <dl className="keyfacts">
      {facts.map((f) => (
        <div className="keyfacts__row" key={f.label}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
