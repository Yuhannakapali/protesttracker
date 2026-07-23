import fs from 'node:fs';
import path from 'node:path';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { GetStaticPaths, GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import LiveDot from '@/components/LiveDot';
import MovementFeed from '@/components/MovementFeed';
import { SkeletonLines } from '@/components/Skeleton';
import {
  fetchMovements,
  fetchArticles,
  fetchTimeline,
  fetchBackground,
  fetchLegal,
  fetchSources,
} from '@/lib/data';
import { isActiveStatus } from '@/lib/status';
import { longDate } from '@/lib/dates';
import { useActiveSection } from '@/lib/useActiveSection';
import { useFirstLoad } from '@/lib/useFirstLoad';
import type {
  Article,
  BackgroundBlock,
  LegalCase,
  Movement,
  Source,
  TimelineEvent,
} from '@/lib/types';

const SECTIONS = [
  { id: 'feed', label: 'Live Feed' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'background', label: 'Background' },
  { id: 'legal', label: 'Legal Tracker' },
  { id: 'sources', label: 'Sources' },
];

interface PageProps {
  id: string;
}

interface Bundle {
  movement: Movement | null;
  articles: Article[];
  timeline: TimelineEvent[];
  background: BackgroundBlock[];
  legal: LegalCase[];
  sources: Source[];
}

export default function MovementPage({ id }: PageProps) {
  const router = useRouter();
  const [data, setData] = useState<Bundle | null>(null);
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
      setData({ movement, articles, timeline, background, legal, sources });
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

  return (
    <Layout title={movement?.name} description={movement?.description}>
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
            <section id="feed" className="mv-section">
              <div className="mv-section__head">
                <h2>Live Feed</h2>
                <span className="mv-section__count">{data!.articles.length} articles</span>
              </div>
              <MovementFeed articles={data!.articles} active={active} />
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
              {data!.sources.length > 0 ? (
                <ul className="source-list">
                  {data!.sources.map((s, i) => (
                    <li className="source-item" key={i}>
                      <span className="source-item__name">{s.name}</span>
                      <span className="source-item__type">{s.type}</span>
                      <span className="source-item__note">{s.note}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state">
                  {active
                    ? 'No sources have been listed yet.'
                    : 'Source list for this archived movement is not available.'}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

// Enumerate movement pages from movements.json at build time. The page
// content itself is fetched client-side at runtime, so overwriting the
// JSON does not require a rebuild (only adding a brand-new id does).
export const getStaticPaths: GetStaticPaths = async () => {
  const file = path.join(process.cwd(), 'public', 'data', 'movements.json');
  let ids: string[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { movements?: { id: string }[] };
    ids = (raw.movements || []).map((m) => m.id);
  } catch {
    ids = [];
  }
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  return { props: { id: String(params?.id) } };
};
