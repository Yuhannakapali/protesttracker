import { longDate, periodLabel as label } from '@/lib/dates';
import type { CoverageBucket } from '@/lib/types';

interface Props {
  buckets: CoverageBucket[];
  granularity: 'week' | 'month';
}

// Geometry is expressed in viewBox units and scaled by CSS, so the chart is
// responsive without measuring anything at runtime.
const VW = 1000;
const PLOT_H = 120;
const AXIS_H = 18;
const VH = PLOT_H + AXIS_H;

// A single article must still paint a visible sliver, or a quiet period reads
// as a gap in the record rather than as low coverage.
const MIN_BAR_H = 1.5;

export default function CoverageChart({ buckets, granularity }: Props) {
  if (buckets.length === 0) return null;

  const max = Math.max(...buckets.map((b) => b.count));
  if (max === 0) return null;

  const slot = VW / buckets.length;
  // Below ~3 units a gap eats the bar itself, and rounded ends stop reading.
  const gap = slot > 5 ? 2 : slot > 2 ? 1 : 0;
  const barW = Math.max(slot - gap, 0.5);
  const radius = barW >= 3 ? 2 : 0;

  const peakIndex = buckets.reduce((best, b, i) => (b.count > buckets[best].count ? i : best), 0);
  const peak = buckets[peakIndex];
  const total = buckets.reduce((n, b) => n + b.count, 0);

  const first = buckets[0];
  const last = buckets[buckets.length - 1];

  return (
    <figure className="coverage">
      <svg
        className="coverage__svg"
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Coverage volume by ${granularity}, ${label(first.start, granularity)} to ${label(last.start, granularity)}. Peak of ${peak.count} articles in ${label(peak.start, granularity)}.`}
      >
        {buckets.map((b, i) => {
          const h = b.count === 0 ? 0 : Math.max((b.count / max) * PLOT_H, MIN_BAR_H);
          if (h === 0) return null;
          return (
            <rect
              key={b.start}
              x={i * slot}
              y={PLOT_H - h}
              width={barW}
              height={h}
              rx={radius}
              className={i === peakIndex ? 'coverage__bar is-peak' : 'coverage__bar'}
            >
              {/* Native tooltip: a hover layer with no script. */}
              <title>{`${label(b.start, granularity)}: ${b.count} article${b.count === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
        <line x1="0" y1={PLOT_H} x2={VW} y2={PLOT_H} className="coverage__axis" />
      </svg>

      {/* Selective labels only — never one per bar. */}
      <div className="coverage__scale">
        <span>{label(first.start, granularity)}</span>
        <span className="coverage__peak">
          peak {peak.count} · {label(peak.start, granularity)}
        </span>
        <span>{label(last.start, granularity)}</span>
      </div>

      <figcaption className="coverage__caption">
        {total} articles by {granularity}, {label(first.start, granularity)} to{' '}
        {label(last.start, granularity)}.
      </figcaption>

      <details className="coverage__table">
        <summary>View coverage as a table</summary>
        <table>
          <caption className="visually-hidden">Article count per {granularity}</caption>
          <thead>
            <tr>
              <th scope="col">{granularity === 'week' ? 'Week of' : 'Month'}</th>
              <th scope="col">Articles</th>
            </tr>
          </thead>
          <tbody>
            {buckets
              .filter((b) => b.count > 0)
              .map((b) => (
                <tr key={b.start}>
                  <th scope="row">{label(b.start, granularity)}</th>
                  <td>{b.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
