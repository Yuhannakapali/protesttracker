import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetStaticPaths, GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import LiveDot from '@/components/LiveDot';
import MovementFeed from '@/components/MovementFeed';
import CoverageChart from '@/components/CoverageChart';
import SourceTallyList from '@/components/SourceTally';
import KeyFacts from '@/components/KeyFacts';
import RelatedMovements from '@/components/RelatedMovements';
import { SkeletonLines } from '@/components/Skeleton';
import {
  fetchMovements,
  fetchArticles,
  fetchArchivedArticles,
  fetchBrief,
  fetchTimeline,
  fetchBackground,
  fetchLegal,
  fetchSources,
} from '@/lib/data';
import { coverageSummary } from '@/lib/overview';
import { regionSlug } from '@/lib/regions';
import { isActiveStatus } from '@/lib/status';
import { longDate } from '@/lib/dates';
import { useActiveSection } from '@/lib/useActiveSection';
import { useFirstLoad } from '@/lib/useFirstLoad';
import {
  ORGANIZATION,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  movementDescription,
  movementHeading,
  movementPlaces,
  movementTitle,
} from '@/lib/seo';
import type {
  Article,
  BackgroundBlock,
  Brief,
  LegalCase,
  Movement,
  MovementStats,
  Source,
  TimelineEvent,
} from '@/lib/types';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'feed', label: 'Live Feed' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'background', label: 'Background' },
  { id: 'legal', label: 'Legal Tracker' },
  { id: 'questions', label: 'Questions' },
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

// How many articles to describe in the ItemList. Structured data is meant to
// characterise the page, not duplicate it, and every entry is bytes in the
// head of an already heavy document.
const SCHEMA_ARTICLE_LIMIT = 20;

interface Bundle {
  movement: Movement | null;
  /** The whole index, for cross-linking to sibling movements. */
  allMovements: Movement[];
  stats: MovementStats;
  brief: Brief;
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
      fetchBrief(id),
    ]).then(([index, articles, timeline, background, legal, sources, brief]) => {
      if (!alive) return;
      const movement = index.movements.find((m) => m.id === id) || null;
      // stats.json is regenerated on the same schedule as the page, so the
      // build-time copy is never staler than the rest of the page.
      setData((prev) => ({
        movement,
        allMovements: index.movements,
        stats: prev?.stats || initialBundle.stats,
        brief,
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
  const stats = data?.stats || initialBundle.stats;
  const brief = data?.brief || initialBundle.brief;
  const timeline = data?.timeline || initialBundle.timeline;
  // timeline.json is hand-curated and never sorted by the aggregation script,
  // so the latest entry is found by date rather than by position.
  const timelineEnd = timeline.reduce((latest, e) => (e.date > latest ? e.date : latest), '');
  const allMovements = data?.allMovements || initialBundle.allMovements;
  const title = movement?.name || 'Movement';

  // The live slice, plus the older coverage once the reader has asked for it.
  const feedArticles = archived ? [...(data?.articles || []), ...archived] : data?.articles || [];

  const canonicalPath = `/movements/${id}/`;

  return (
    <Layout
      title={movement ? movementTitle(movement.name, movement.location) : undefined}
      description={
        movement ? movementDescription(movement.description, movement.articleCount) : undefined
      }
      path={canonicalPath}
      image={`/og/${id}.png`}
      feed={`/movements/${id}/feed`}
      jsonLd={
        movement
          ? [
              {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: movementHeading(movement.name, movement.location),
                description: movement.description,
                url: absoluteUrl(canonicalPath),
                isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAME },
                publisher: { '@id': `${SITE_URL}/#organization` },
                inLanguage: 'en',
                // Coverage dates, not the date we started tracking: these are
                // what tell a crawler the page is still being updated.
                datePublished: stats.firstDate || movement.logged,
                dateModified: stats.lastDate || movement.logged,
                about: {
                  '@type': 'Event',
                  name: movementHeading(movement.name, movement.location),
                  description: movement.description,
                  url: absoluteUrl(canonicalPath),
                  // The movement's own Open Graph card, generated by
                  // scripts/og-images.mjs, so this is a real image of the
                  // subject rather than a stock stand-in.
                  image: {
                    '@type': 'ImageObject',
                    url: absoluteUrl(`/og/${id}.png`),
                    width: OG_IMAGE_WIDTH,
                    height: OG_IMAGE_HEIGHT,
                  },
                  location: movementPlaces(movement.location),
                  // When this wave of protest began, not stats.firstDate:
                  // the coverage reaches back years into earlier rounds of the
                  // same dispute, which is a different event from this one.
                  startDate: movement.logged,
                  // eventStatus records whether an event ran as planned, not
                  // whether it is still to come, so a movement that happened
                  // is EventScheduled whether or not it has since ended.
                  // Cancelled/Postponed/Rescheduled describe organiser
                  // decisions we have no data for and would be false here.
                  eventStatus: 'https://schema.org/EventScheduled',
                  // Only a concluded movement has an end date. Quiet and
                  // Dormant mean coverage has slowed, not that the movement
                  // finished, and an ongoing one has no end date to give.
                  //
                  // The date comes from the last curated timeline entry — the
                  // resolution itself — not from stats.lastDate. Coverage of a
                  // concluded movement runs on for years through court cases
                  // and anniversaries, so the newest article is nowhere near
                  // the day the protests ended.
                  ...(movement.status === 'Concluded' && timelineEnd
                    ? { endDate: timelineEnd }
                    : {}),
                  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
                  // No `organizer`: these movements are decentralised and the
                  // data model records no organising body for any of them.
                  // Naming one would be a guess, and naming ourselves would
                  // be false — we document these protests, we do not run them.
                },
                // The coverage itself, so the page is legible as a curated
                // list of reporting rather than an undifferentiated wall.
                mainEntity: {
                  '@type': 'ItemList',
                  name: `Coverage of ${movementHeading(movement.name, movement.location)}`,
                  numberOfItems: movement.articleCount,
                  itemListOrder: 'https://schema.org/ItemListOrderDescending',
                  itemListElement: (data?.articles || []).slice(0, SCHEMA_ARTICLE_LIMIT).map(
                    (a, i) => ({
                      '@type': 'ListItem',
                      position: i + 1,
                      item: {
                        '@type': 'NewsArticle',
                        headline: a.title,
                        url: a.url,
                        datePublished: a.date,
                        publisher: { '@type': 'Organization', name: a.source },
                      },
                    }),
                  ),
                },
              },
              { '@context': 'https://schema.org', ...ORGANIZATION },
              ...(brief.faq.length > 0
                ? [
                    {
                      '@context': 'https://schema.org',
                      '@type': 'FAQPage',
                      mainEntity: brief.faq.map((item) => ({
                        '@type': 'Question',
                        name: item.q,
                        acceptedAnswer: { '@type': 'Answer', text: item.a },
                      })),
                    },
                  ]
                : []),
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
              <h1 style={{ marginTop: 12 }}>
                {movementHeading(movement.name, movement.location)}
              </h1>
              <p className="lede">{movement.description}</p>
              <p className="count-line" style={{ marginTop: 14, gap: 16 }}>
                <span>
                  <Link className="mv-region" href={`/regions/${regionSlug(movement.region)}/`}>
                    {movement.region}
                  </Link>
                  {' · '}
                  {movement.location}
                </span>
                <span>·</span>
                <span>{movement.articleCount} articles</span>
                <span>·</span>
                <span>
                  logged <time dateTime={movement.logged}>{longDate(movement.logged)}</time>
                </span>
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
            <section id="overview" className="mv-section">
              <div className="mv-section__head">
                <h2>Overview</h2>
              </div>
              {/* The written account first when there is one, then the
                  archive's own description of what it holds. The second is
                  derived, so every movement has an overview from day one. */}
              {brief.summary && <p className="mv-summary">{brief.summary}</p>}
              <p className="mv-coverage-note">{coverageSummary(movement, stats)}</p>
              <KeyFacts movement={movement} stats={stats} />
            </section>

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
                  {/* The stored blocks often open with their own "Background"
                      heading, which would restate the section's h2 one level
                      down. Drop it rather than edit every data file. */}
                  {data!.background
                    .filter((b, i) => !(i === 0 && b.type === 'h' && b.text === 'Background'))
                    .map((b, i) =>
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

            <section id="questions" className="mv-section">
              <div className="mv-section__head">
                <h2>Questions</h2>
              </div>
              {data!.brief.faq.length > 0 ? (
                <div className="faq">
                  {data!.brief.faq.map((item) => (
                    <details className="faq__item" key={item.q}>
                      <summary>
                        <h3>{item.q}</h3>
                      </summary>
                      <p>{item.a}</p>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  Common questions for this movement have not been written up yet.
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

            <RelatedMovements current={movement} movements={allMovements} />
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
        allMovements: server.readMovements().movements,
        stats: server.readStats(id),
        brief: server.readBrief(id),
        articles: server.readArticles(id).slice(0, PRERENDER_ARTICLE_LIMIT),
        timeline: server.readTimeline(id),
        background: server.readBackground(id),
        legal: server.readLegal(id),
        sources: server.readSources(id),
      },
    },
  };
};
