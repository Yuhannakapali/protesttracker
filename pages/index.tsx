import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import MovementCard from '@/components/MovementCard';
import LiveDot from '@/components/LiveDot';
import { SkeletonCards } from '@/components/Skeleton';
import { fetchMovements } from '@/lib/data';
import { byRecencyDesc } from '@/lib/sort';
import { isActiveStatus } from '@/lib/status';
import { useFirstLoad } from '@/lib/useFirstLoad';
import { ORGANIZATION, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/seo';
import type { Movement } from '@/lib/types';

interface PageProps {
  initialMovements: Movement[];
}

export default function Home({ initialMovements }: PageProps) {
  // Seeded from the build so the movement list is present in the HTML a
  // crawler receives; the effect below refreshes it from the live JSON.
  const [movements, setMovements] = useState<Movement[] | null>(initialMovements);
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
    <Layout
      title="Live Archive of Global Protest Movements"
      description="Track active and escalating protest movements worldwide: timelines, legal cases and continuously aggregated coverage from public reporting."
      path="/"
      jsonLd={[
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          description: SITE_DESCRIPTION,
          publisher: { '@id': `${SITE_URL}/#organization` },
          // Declares the on-site search so Google can offer a sitelinks
          // searchbox straight from the result.
          potentialAction: {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${SITE_URL}/search/?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
        },
        { '@context': 'https://schema.org', ...ORGANIZATION },
      ]}
    >
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Independent news archive</p>
          <h1>Protest movements now</h1>
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

// Read the movement index at build time so the page ships with content.
// The workflow rebuilds after every aggregation run, so this stays current.
export const getStaticProps: GetStaticProps<PageProps> = async () => {
  const { readMovements } = await import('@/lib/server-data');
  return { props: { initialMovements: readMovements().movements } };
};
