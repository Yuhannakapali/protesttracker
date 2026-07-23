import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import MovementCard from '@/components/MovementCard';
import { SkeletonCards } from '@/components/Skeleton';
import { fetchMovements } from '@/lib/data';
import { byRecencyDesc } from '@/lib/sort';
import { isActiveStatus } from '@/lib/status';
import { useFirstLoad } from '@/lib/useFirstLoad';
import type { Movement } from '@/lib/types';

const ALL = 'All';

export default function Archive() {
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [region, setRegion] = useState<string>(ALL);
  const [year, setYear] = useState<string>(ALL);
  const loading = useFirstLoad(movements !== null);

  useEffect(() => {
    let alive = true;
    fetchMovements().then(({ movements }) => {
      if (alive) setMovements(movements);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Archive shows all non-active movements.
  const archived = useMemo(
    () => (movements || []).filter((m) => !isActiveStatus(m.status)),
    [movements],
  );

  const regions = useMemo(
    () => [ALL, ...Array.from(new Set(archived.map((m) => m.region))).sort()],
    [archived],
  );
  const years = useMemo(
    () => [
      ALL,
      ...Array.from(new Set(archived.map((m) => String(m.year)))).sort((a, b) => Number(b) - Number(a)),
    ],
    [archived],
  );

  const filtered = archived
    .filter((m) => region === ALL || m.region === region)
    .filter((m) => year === ALL || String(m.year) === year)
    .sort(byRecencyDesc);

  return (
    <Layout title="Archive" description="Quiet, dormant, and concluded protest movements documented in the archive.">
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">The record</p>
          <h1>Archive</h1>
          <p className="lede">
            Movements that are quiet, dormant, or concluded. Filter by region and year.
          </p>
        </div>

        {!loading && (
          <div className="filters">
            <div className="filter-group">
              <span className="filter-group__label">Region</span>
              <div className="chip-row">
                {regions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="chip"
                    aria-pressed={region === r}
                    onClick={() => setRegion(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-group__label">Year</span>
              <div className="chip-row">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className="chip"
                    aria-pressed={year === y}
                    onClick={() => setYear(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="section-pad">
          {loading ? (
            <SkeletonCards count={4} />
          ) : filtered.length > 0 ? (
            <div className="card-grid">
              {filtered.map((m) => (
                <MovementCard key={m.id} movement={m} />
              ))}
            </div>
          ) : (
            <div className="empty-state">No archived movements match the current filters.</div>
          )}
        </div>
      </div>
    </Layout>
  );
}
