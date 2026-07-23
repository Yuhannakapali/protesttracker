import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MovementCard from '@/components/MovementCard';
import LiveDot from '@/components/LiveDot';
import { SkeletonCards } from '@/components/Skeleton';
import { fetchMovements } from '@/lib/data';
import { byRecencyDesc } from '@/lib/sort';
import { isActiveStatus } from '@/lib/status';
import { useFirstLoad } from '@/lib/useFirstLoad';
import type { Movement } from '@/lib/types';

export default function Home() {
  const [movements, setMovements] = useState<Movement[] | null>(null);
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

  const active = (movements || []).filter((m) => isActiveStatus(m.status)).sort(byRecencyDesc);
  const archived = (movements || []).filter((m) => !isActiveStatus(m.status)).sort(byRecencyDesc);
  const count = active.length;

  return (
    <Layout description="Active and escalating protest movements, updated automatically from public reporting.">
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Independent news archive</p>
          <h1>Movements now</h1>
          <p className="lede">
            An automatically updated record of protest movements as they unfold. Active and
            escalating movements appear here first; everything else lives in the archive.
          </p>
          {!loading && (
            <p className="count-line" style={{ marginTop: 18 }}>
              {count > 0 && <LiveDot />}
              {count} {count === 1 ? 'movement' : 'movements'} active
            </p>
          )}
        </div>

        <div className="section-pad">
          {loading ? (
            <SkeletonCards count={4} />
          ) : count > 0 ? (
            <>
              <div className="card-grid">
                {active.map((m) => (
                  <MovementCard key={m.id} movement={m} showHeadlines />
                ))}
              </div>
              <p style={{ marginTop: 32 }}>
                <Link href="/archive/" className="mono">
                  Browse the full archive →
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="note">
                No movements are active right now. Below is the archive of movements documented so
                far.
              </p>
              {archived.length > 0 ? (
                <div className="card-grid" style={{ marginTop: 24 }}>
                  {archived.map((m) => (
                    <MovementCard key={m.id} movement={m} />
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ marginTop: 24 }}>
                  No movements have been documented yet.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
