import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { longDate } from '@/lib/dates';
import { outboundRel } from '@/lib/links';
import { loadSearchIndex, loadSearchUrls, search } from '@/lib/search';
import type { SearchIndex } from '@/lib/search';
import type { Movement } from '@/lib/types';

const PAGE_SIZE = 40;

interface PageProps {
  movements: Movement[];
  articleCount: number;
}

export default function SearchPage({ movements, articleCount }: PageProps) {
  const router = useRouter();
  // The URL is the source of truth for the query, so a result page can be
  // linked, bookmarked and reloaded. The input mirrors it.
  const initial = typeof router.query.q === 'string' ? router.query.q : '';
  const [query, setQuery] = useState(initial);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [urls, setUrls] = useState<string[] | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [ready, setReady] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt ?q= once the router hydrates it — on a static export the first
  // render has an empty query object.
  useEffect(() => {
    if (!router.isReady) return;
    const q = typeof router.query.q === 'string' ? router.query.q : '';
    setQuery((prev) => (prev === q ? prev : q));
  }, [router.isReady, router.query.q]);

  useEffect(() => {
    let alive = true;
    loadSearchIndex().then((loaded) => {
      if (!alive) return;
      setIndex(loaded);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const results = useMemo(() => search(index, query, limit), [index, query, limit]);

  // The URL table is three times the size of everything else, so it is only
  // worth fetching once a query has actually produced links to render.
  useEffect(() => {
    if (results.articles.length === 0 || urls) return;
    let alive = true;
    loadSearchUrls().then((loaded) => {
      if (alive) setUrls(loaded);
    });
    return () => {
      alive = false;
    };
  }, [results.articles.length, urls]);

  // Push the query into the address bar, but only after typing settles, so
  // one search does not leave forty entries in the back button.
  const syncUrl = useCallback(
    (value: string) => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        const url = value ? `/search/?q=${encodeURIComponent(value)}` : '/search/';
        router.replace(url, undefined, { shallow: true });
      }, 350);
    },
    [router],
  );

  useEffect(() => () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
  }, []);

  const onChange = (value: string) => {
    setQuery(value);
    setLimit(PAGE_SIZE);
    syncUrl(value);
  };

  const trimmed = query.trim();
  const searching = trimmed.length > 0;

  return (
    <Layout
      title={trimmed ? `Search: ${trimmed}` : 'Search'}
      description={`Search ${articleCount.toLocaleString()} articles across every movement in the archive.`}
      path="/search/"
    >
      <Head>
        {/* A result page is thin, duplicated content; the movement pages it
            points at are the ones worth ranking. */}
        {searching && <meta name="robots" content="noindex,follow" />}
      </Head>

      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Search</p>
          <h1>Search the archive</h1>
          <p className="lede">
            {articleCount.toLocaleString()} articles across {movements.length} movements. Every
            term has to match, in any order.
          </p>
        </div>

        <form className="search-page__form" role="search" onSubmit={(e) => e.preventDefault()}>
          <label className="visually-hidden" htmlFor="search-input">
            Search movements and articles
          </label>
          <input
            id="search-input"
            type="search"
            autoComplete="off"
            value={query}
            placeholder="fuel subsidy, pension reform, Nairobi…"
            onChange={(e) => onChange(e.target.value)}
          />
        </form>

        <div className="section-pad">
          {!searching ? (
            <div className="search-page__browse">
              <h2 className="section-title">Browse movements</h2>
              <ul className="search-page__movements">
                {movements.map((m) => (
                  <li key={m.id}>
                    <Link href={`/movements/${m.id}/`}>{m.name}</Link>
                    <span>{m.location}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : !ready ? (
            <p className="empty-state">Loading the index…</p>
          ) : results.total === 0 && results.movements.length === 0 ? (
            <p className="empty-state">No matches for “{trimmed}”.</p>
          ) : (
            <>
              {results.movements.length > 0 && (
                <section className="search-page__group">
                  <h2 className="section-title">
                    Movements <span className="search-page__count">{results.movements.length}</span>
                  </h2>
                  <ul className="search-page__movements">
                    {results.movements.map((m) => (
                      <li key={m.id}>
                        <Link href={`/movements/${m.id}/`}>{m.name}</Link>
                        <span>{m.location}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {results.total > 0 && (
                <section className="search-page__group">
                  <h2 className="section-title">
                    Articles <span className="search-page__count">{results.total}</span>
                  </h2>
                  <ol className="search-page__results">
                    {results.articles.map((hit) => {
                      const href = urls?.[hit.ref];
                      return (
                        <li key={hit.ref}>
                          <h3>
                            {href ? (
                              <a href={href} target="_blank" rel={outboundRel(href)}>
                                {hit.title}
                              </a>
                            ) : (
                              hit.title
                            )}
                          </h3>
                          {hit.excerpt && <p className="search-page__excerpt">{hit.excerpt}</p>}
                          <p className="search-page__meta">
                            {hit.source} · <time dateTime={hit.date}>{longDate(hit.date)}</time>{' '}
                            ·{' '}
                            <Link href={`/movements/${hit.movement.id}/`}>{hit.movement.name}</Link>
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                  {results.total > results.articles.length && (
                    <button
                      type="button"
                      className="feed-more"
                      onClick={() => setLimit((n) => n + PAGE_SIZE)}
                    >
                      Show more results ({results.total - results.articles.length} remaining)
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<PageProps> = async () => {
  const { readMovements } = await import('@/lib/server-data');
  const { movements } = readMovements();
  return {
    props: {
      movements,
      articleCount: movements.reduce((n, m) => n + (m.articleCount || 0), 0),
    },
  };
};
