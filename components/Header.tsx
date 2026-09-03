import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ThemeToggle from '@/components/ThemeToggle';
import { loadSearchIndex, search } from '@/lib/search';
import type { SearchIndex } from '@/lib/search';

// The dropdown is a preview, not the results page: enough to recognise the
// thing you were looking for, with /search/ one keystroke away.
const PREVIEW_HITS = 6;

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/archive/', label: 'Archive' },
  { href: '/about/', label: 'About' },
];

export default function Header() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Pull the prebuilt index on first focus. It carries no article URLs, so
  // this costs a fraction of what loading every movement's feed did.
  const ensureIndex = async () => {
    if (index || loading) return;
    setLoading(true);
    const loaded = await loadSearchIndex();
    setIndex(loaded);
    setLoading(false);
  };

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Close on route change.
  useEffect(() => {
    const done = () => {
      setOpen(false);
      setQuery('');
    };
    router.events.on('routeChangeComplete', done);
    return () => router.events.off('routeChangeComplete', done);
  }, [router.events]);

  const q = query.trim();
  const results = useMemo(() => search(index, q, PREVIEW_HITS), [index, q]);
  const movementHits = results.movements.slice(0, PREVIEW_HITS);
  const articleHits = results.articles;

  const showResults = open && q.length > 0;
  const hasHits = movementHits.length > 0 || articleHits.length > 0;

  const goToResults = () => {
    setOpen(false);
    router.push(`/search/?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand" aria-label="ProtestTracker home">
          <span className="brand__square" aria-hidden="true" />
          <span className="brand__name">ProtestTracker</span>
          <span className="brand__chip">Archive</span>
        </Link>

        <div className="header-search" ref={boxRef}>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q) goToResults();
            }}
          >
            <span className="header-search__glyph" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              placeholder="Search movements and articles"
              aria-label="Search movements and articles"
              onFocus={() => {
                ensureIndex();
                setOpen(true);
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
            />
          </form>
          {showResults && (
            <div className="search-results" role="listbox" aria-label="Search results">
              {!index && loading && (
                <div className="search-results__empty">Loading index…</div>
              )}
              {index && !hasHits && (
                <div className="search-results__empty">No matches for “{query}”.</div>
              )}
              {movementHits.length > 0 && (
                <div className="search-results__group">
                  <div className="search-results__label">Movements</div>
                  {movementHits.map((m) => (
                    <Link key={m.id} href={`/movements/${m.id}/`}>
                      {m.name}
                      <small>{m.location}</small>
                    </Link>
                  ))}
                </div>
              )}
              {articleHits.length > 0 && (
                <div className="search-results__group">
                  <div className="search-results__label">Articles</div>
                  {articleHits.map((a) => (
                    <Link key={a.ref} href={`/search/?q=${encodeURIComponent(q)}`}>
                      {a.title}
                      <small>
                        {a.source} · {a.movement.name}
                      </small>
                    </Link>
                  ))}
                </div>
              )}
              {hasHits && (
                <button type="button" className="search-results__all" onClick={goToResults}>
                  {results.total > articleHits.length
                    ? `See all ${results.total} articles`
                    : 'Open in search'}
                  <span aria-hidden="true"> →</span>
                </button>
              )}
            </div>
          )}
        </div>

        <nav className="header-nav" aria-label="Primary">
          {NAV.map((item) => {
            const current =
              item.href === '/'
                ? router.pathname === '/'
                : router.pathname.startsWith(item.href.replace(/\/$/, ''));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? 'page' : undefined}
              >
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
