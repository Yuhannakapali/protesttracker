import { longDate } from '@/lib/dates';
import type { SourceTally as Tally } from '@/lib/types';

// How many outlets to list before collapsing the tail. Enough to show the
// shape of the coverage without printing 155 rows.
const VISIBLE = 25;

export default function SourceTallyList({ sources }: { sources: Tally[] }) {
  if (sources.length === 0) return null;
  const shown = sources.slice(0, VISIBLE);
  const rest = sources.length - shown.length;

  return (
    <div className="tally">
      <p className="tally__lede">
        {sources.length} outlets have covered this movement. Counts are from the archive
        itself, not a curated list.
      </p>
      <ol className="tally__list">
        {shown.map((s) => (
          <li key={s.name}>
            <span className="tally__name">{s.name}</span>
            <span className="tally__count">
              {s.count} article{s.count === 1 ? '' : 's'}
            </span>
            <span className="tally__span">
              {s.first === s.last ? longDate(s.first) : `${longDate(s.first)} – ${longDate(s.last)}`}
            </span>
          </li>
        ))}
      </ol>
      {rest > 0 && (
        <p className="tally__rest">
          and {rest} further outlet{rest === 1 ? '' : 's'} with fewer articles.
        </p>
      )}
    </div>
  );
}
