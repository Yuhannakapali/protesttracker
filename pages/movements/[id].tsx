import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { GetStaticPaths, GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import LiveDot from '@/components/LiveDot';
import MovementFeed from '@/components/MovementFeed';
import CoverageChart from '@/components/CoverageChart';
import SourceTallyList from '@/components/SourceTally';
import { SkeletonLines } from '@/components/Skeleton';
import {
  fetchMovements,
  fetchArticles,
  fetchArchivedArticles,
  fetchTimeline,
  fetchBackground,
  fetchLegal,
  fetchSources,
} from '@/lib/data';
import { isActiveStatus } from '@/lib/status';
import { longDate } from '@/lib/dates';
import { useActiveSection } from '@/lib/useActiveSection';
import { useFirstLoad } from '@/lib/useFirstLoad';
import { SITE_NAME, absoluteUrl } from '@/lib/seo';
import type {
  Article,
  BackgroundBlock,
  LegalCase,
  Movement,
  MovementStats,
  Source,
  TimelineEvent,
} from '@/lib/types';

const SECTIONS = [
  { id: 'coverage', label: 'Coverage' },
  { id: 'feed', label: 'Live Feed' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'background', label: 'Background' },
  { id: 'legal', label: 'Legal Tracker' },
  { id: 'sources', label: 'Sources' },
];

interface PageProps {
  id: string;
  initialBundle: Bundle;
}

// How many articles to bake into the prerendered HTML. The full feed runs to
// several hundred, which would put roughly a megabyte on the page once the
// rendered DOM and the __NEXT_DATA__ copy of the props are counted. A recent
// slice is enough for crawlers to index; the client refetch loads the rest.
const PRERENDER_ARTICLE_LIMIT = 60;

interface Bundle {
  movement: Movement | null;
  stats: MovementStats;
  articles: Article[];
  timeline: TimelineEvent[];
  background: BackgroundBlock[];
  legal: LegalCase[];
  sources: Source[];
}

export default function MovementPage({ id, initialBundle }: PageProps) {
  const router = useRouter();
  // Seeded from the build so the headline feed, timeline and background are
  // in the prerendered HTML; the effect below refreshes them from the live
  // JSON, which the aggregator rewrites every two hours.
  const [data, setData] = useState<Bundle | null>(initialBundle);
  // Coverage older than the live slice, fetched only if the reader asks.
  const [archived, setArchived] = useState<Article[] | null>(null);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const loading = useFirstLoad(data !== null);
  const activeSection = useActiveSection(
    SECTIONS.map((s) => s.id),
    [data !== null],
  );

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.all([
      fetchMovements(),
      fetchArticles(id),
      fetchTimeline(id),
      fetchBackground(id),
      fetchLegal(id),
      fetchSources(id),
    ]).then(([index, articles, timeline, background, legal, sources]) => {
      if (!alive) return;
      const movement = index.movements.find((m) => m.id === id) || null;
      // stats.json is regenerated on the same schedule as the page, so the
      // build-time copy is never staler than the rest of the page.
      setData((prev) => ({
        movement,
        stats: prev?.stats || initialBundle.stats,
        articles,
        timeline,
        background,
        legal,
        sources,
      }));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // During static export fallback / router hydration.
  if (router.isFallback) {
    return (
      <Layout>
        <div className="container section-pad">
          <SkeletonLines count={8} />
        </div>
      </Layout>
    );
  }

  const movement = data?.movement || null;
  const active = movement ? isActiveStatus(movement.status) : false;
  const title = movement?.name || 'Movement';

  // The live slice, plus the older coverage once the reader has asked for it.
  const feedArticles = archived ? [...(data?.articles || []), ...archived] : data?.articles || [];

  const canonicalPath = `/movements/${id}/`;

  return (
    <Layout
      title={movement?.name}
      description={movement?.description}
      path={canonicalPath}
      jsonLd={
        movement
          ? [
              {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: movement.name,
                description: movement.description,
                url: absoluteUrl(canonicalPath),
                isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: absoluteUrl('/') },
                about: {
                  '@type': 'Event',
                  name: movement.name,
                  description: movement.description,
                  location: { '@type': 'Place', name: movement.location },
                  startDate: movement.logged,
                },
              },
              {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                  {
                    '@type': 'ListItem',
                    position: 1,
                    name: SITE_NAME,
                    item: absoluteUrl('/'),
                  },
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: movement.name,
                    item: absoluteUrl(canonicalPath),
                  },
                ],
              },
            ]
          : undefined
      }
    >
      <div className="container">
        <div className="page-head">
          {loading || !movement ? (
            <SkeletonLines count={3} />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <StatusBadge status={movement.status} />
                {active && (
                  <span className="count-line">
                    <LiveDot /> live coverage
                  </span>
                )}
              </div>
              <h1 style={{ marginTop: 12 }}>{movement.name}</h1>
              <p className="lede">{movement.description}</p>
              <p className="count-line" style={{ marginTop: 14, gap: 16 }}>
                <span>{movement.location}</span>
                <span>·</span>
                <span>{movement.articleCount} articles</span>
                <span>·</span>
                <span>logged {longDate(movement.logged)}</span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Sticky in-page navigation */}
      <nav className="subnav" aria-label={`${title} sections`}>
        <div className="subnav__inner">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={activeSection === s.id ? 'is-active' : ''}>
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="container">
        {loading || !movement ? (
          <div className="section-pad">
            <SkeletonLines count={10} />
          </div>
        ) : (
          <>
            <section id="coverage" className="mv-section">
              <div className="mv-section__head">
                <h2>Coverage</h2>
                <span className="mv-section__count">
                  {data!.stats.sources.length} outlets
                </span>
              </div>
              {data!.stats.buckets.length > 0 ? (
                <CoverageChart
                  buckets={data!.stats.buckets}
                  granularity={data!.stats.granularity}
                />
              ) : (
                <div className="empty-state">Not enough coverage to chart yet.</div>
              )}
            </section>

            <section id="feed" className="mv-section">
              <div className="mv-section__head">
                <h2>Live Feed</h2>
                <span className="mv-section__count">
                  {feedArticles.length} of {movement.articleCount} articles
                </span>
              </div>
              <MovementFeed articles={feedArticles} active={active} />
              {archived === null && movement.articleCount > data!.articles.length && (
                <p className="feed-more">
                  <button
                    type="button"
                    className="chip"
                    disabled={loadingArchive}
                    onClick={() => {
                      setLoadingArchive(true);
                      fetchArchivedArticles(id)
                        .then((older) => setArchived(older))
                        .finally(() => setLoadingArchive(false));
                    }}
                  >
                    {loadingArchive
                      ? 'Loading older coverage…'
                      : `Load ${movement.articleCount - data!.articles.length} older articles`}
                  </button>
                </p>
              )}
            </section>

            <section id="timeline" className="mv-section">
              <div className="mv-section__head">
                <h2>Timeline</h2>
              </div>
              {data!.timeline.length > 0 ? (
                <ul className="timeline">
                  {data!.timeline
                    .slice()
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((e, i) => (
                      <li key={i}>
                        <div className="t-date">{longDate(e.date)}</div>
                        <div className="t-title">{e.title}</div>
                        <p className="t-body">{e.body}</p>
                      </li>
                    ))}
                </ul>
              ) : (
                <div className="empty-state">
                  {active
                    ? 'No key events have been recorded yet.'
                    : 'Key events for this archived movement have not been compiled.'}
                </div>
              )}
            </section>

            <section id="background" className="mv-section">
              <div className="mv-section__head">
                <h2>Background</h2>
              </div>
              {data!.background.length > 0 ? (
                <div className="prose">
                  {data!.background.map((b, i) =>
                    b.type === 'h' ? <h3 key={i}>{b.text}</h3> : <p key={i}>{b.text}</p>,
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  Background for this movement has not been compiled.
                </div>
              )}
            </section>

            <section id="legal" className="mv-section">
              <div className="mv-section__head">
                <h2>Legal Tracker</h2>
                {data!.legal.length > 0 && (
                  <span className="mv-section__count">{data!.legal.length} cases</span>
                )}
              </div>
              {data!.legal.length > 0 ? (
                <div className="legal-grid">
                  {data!.legal.map((c, i) => (
                    <div className="legal-card" key={i}>
                      <div className="legal-card__top">
                        <div>
                          <div className="legal-card__name">{c.name}</div>
                          <div className="legal-card__court">{c.court}</div>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="legal-card__label">{c.label}</div>
                      <p className="legal-card__summary">{c.summary}</p>
                      <div className="legal-card__updated">Updated {longDate(c.updated)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  No legal cases are being tracked for this movement.
                </div>
              )}
            </section>

            <section id="sources" className="mv-section">
              <div className="mv-section__head">
                <h2>Sources</h2>
              </div>
              {data!.sources.length > 0 && (
                <ul className="source-list">
                  {data!.sources.map((s, i) => (
                    <li className="source-item" key={i}>
                      <span className="source-item__name">{s.name}</span>
                      <span className="source-item__type">{s.type}</span>
                      <span className="source-item__note">{s.note}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Derived from the archive, so this is never empty once any
                  article has been logged — unlike the curated list above. */}
              <SourceTallyList sources={data!.stats.sources} />
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

// Enumerate movement pages from movements.json at build time, and read
// each movement's content so the page is prerendered with it. The deploy
// workflow rebuilds after every aggregation run, so the HTML never lags
// the JSON by more than one cycle; the client refetch closes the gap for
// anyone already on the page.
export const getStaticPaths: GetStaticPaths = async () => {
  const { readMovements } = await import('@/lib/server-data');
  const ids = readMovements().movements.map((m) => m.id);
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  const id = String(params?.id);
  const server = await import('@/lib/server-data');
  return {
    props: {
      id,
      initialBundle: {
        movement: server.readMovements().movements.find((m) => m.id === id) || null,
        stats: server.readStats(id),
        articles: server.readArticles(id).slice(0, PRERENDER_ARTICLE_LIMIT),
        timeline: server.readTimeline(id),
        background: server.readBackground(id),
        legal: server.readLegal(id),
        sources: server.readSources(id),
      },
    },
  };
};
