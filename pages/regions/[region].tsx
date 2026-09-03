import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GetStaticPaths, GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import MovementCard from '@/components/MovementCard';
import { fetchMovements } from '@/lib/data';
import { byRecencyDesc } from '@/lib/sort';
import { isActiveStatus } from '@/lib/status';
import { ORGANIZATION, SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo';
import { regionSlug, regionsOf } from '@/lib/regions';
import type { Movement } from '@/lib/types';

interface PageProps {
  region: string;
  slug: string;
  initialMovements: Movement[];
}

export default function RegionPage({ region, slug, initialMovements }: PageProps) {
  const [movements, setMovements] = useState<Movement[]>(initialMovements);

  useEffect(() => {
    let alive = true;
    fetchMovements().then((index) => {
      if (alive) setMovements(index.movements.filter((m) => m.region === region));
    });
    return () => {
      alive = false;
    };
  }, [region]);

  const sorted = [...movements].sort(byRecencyDesc);
  const live = sorted.filter((m) => isActiveStatus(m.status));
  const past = sorted.filter((m) => !isActiveStatus(m.status));
  const articles = sorted.reduce((n, m) => n + (m.articleCount || 0), 0);
  const path = `/regions/${slug}/`;

  const description = `Protest movements tracked in ${region}: ${sorted.length} movement${
    sorted.length === 1 ? '' : 's'
  } with ${articles.toLocaleString('en-US')} sourced reports, timelines and legal trackers.`;

  return (
    <Layout
      title={`Protest Movements in ${region}`}
      description={description}
      path={path}
      jsonLd={[
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `Protest movements in ${region}`,
          description,
          url: absoluteUrl(path),
          isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAME },
          publisher: { '@id': `${SITE_URL}/#organization` },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: sorted.length,
            itemListElement: sorted.map((m, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: m.name,
              item: absoluteUrl(`/movements/${m.id}/`),
            })),
          },
        },
        { '@context': 'https://schema.org', ...ORGANIZATION },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl('/') },
            { '@type': 'ListItem', position: 2, name: region, item: absoluteUrl(path) },
          ],
        },
      ]}
    >
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Region</p>
          <h1>Protest movements in {region}</h1>
          <p className="lede">
            {sorted.length} movement{sorted.length === 1 ? '' : 's'} tracked in {region}, holding{' '}
            {articles.toLocaleString('en-US')} sourced reports. Each entry keeps its own timeline,
            legal tracker and continuously updated coverage.
          </p>
        </div>

        {live.length > 0 && (
          <div className="section-pad">
            <h2 className="section-title">Currently tracked</h2>
            <div className="card-grid" style={{ marginTop: 18 }}>
              {live.map((m) => (
                <MovementCard key={m.id} movement={m} />
              ))}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div className="section-pad">
            <h2 className="section-title">Archived</h2>
            <div className="card-grid" style={{ marginTop: 18 }}>
              {past.map((m) => (
                <MovementCard key={m.id} movement={m} />
              ))}
            </div>
          </div>
        )}

        <div className="section-pad">
          <p className="page-head__note">
            <Link href="/">All movements now</Link> · <Link href="/archive/">Full archive</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { readMovements } = await import('@/lib/server-data');
  return {
    paths: regionsOf(readMovements().movements).map((r) => ({
      params: { region: regionSlug(r) },
    })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async (ctx) => {
  const { readMovements } = await import('@/lib/server-data');
  const slug = String(ctx.params?.region);
  const all = readMovements().movements;
  const region = regionsOf(all).find((r) => regionSlug(r) === slug);
  if (!region) return { notFound: true };
  return {
    props: {
      region,
      slug,
      initialMovements: all.filter((m) => m.region === region),
    },
  };
};
