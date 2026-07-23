import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ThemeToggle from '@/components/ThemeToggle';
import { fetchMovements, fetchArticles } from '@/lib/data';
import type { Article, Movement } from '@/lib/types';

interface ArticleHit extends Article {
  movementId: string;
  movementName: string;
}

interface SearchIndex {
  movements: Movement[];
  articles: ArticleHit[];
}

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

  // Build the search index lazily on first focus.
  const ensureIndex = async () => {
    if (index || loading) return;
    setLoading(true);
    const { movements } = await fetchMovements();
    const lists = await Promise.all(
      movements.map(async (m) => {
        const articles = await fetchArticles(m.id);
        return articles.map<ArticleHit>((a) => ({
          ...a,
          movementId: m.id,
          movementName: m.name,
        }));
      }),
    );
    setIndex({ movements, articles: lists.flat() });
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

  const q = query.trim().toLowerCase();
  const movementHits = q && index
    ? index.movements
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.location.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];
  const articleHits = q && index
    ? index.articles
        .filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.source.toLowerCase().includes(q) ||
            a.excerpt.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];

  const showResults = open && q.length > 0;
  const hasHits = movementHits.length > 0 || articleHits.length > 0;

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand" aria-label="ProtestTracker home">
          <span className="brand__square" aria-hidden="true" />
          <span className="brand__name">ProtestTracker</span>
          <span className="brand__chip">Archive</span>
        </Link>

        <div className="header-search" ref={boxRef}>
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
                  {articleHits.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
                      {a.title}
                      <small>
                        {a.source} · {a.movementName}
                      </small>
                    </a>
                  ))}
                </div>
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
