import { useMemo, useState } from 'react';
import { groupByDate, longDate, timeAgo } from '@/lib/dates';
import type { Article } from '@/lib/types';

const ALL = 'All';

export default function MovementFeed({
  articles,
  active,
}: {
  articles: Article[];
  active: boolean;
}) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<string>(ALL);

  // Source chips derived from the movement's own articles.
  const sources = useMemo(
    () => [ALL, ...Array.from(new Set(articles.map((a) => a.source))).sort()],
    [articles],
  );

  const q = query.trim().toLowerCase();
  const filtered = articles
    .filter((a) => source === ALL || a.source === source)
    .filter(
      (a) =>
        !q ||
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q),
    );

  const groups = groupByDate(filtered);

  // Distinct "not yet compiled" state for an archived movement with no feed.
  if (articles.length === 0) {
    return (
      <div className="empty-state">
        {active
          ? 'No articles have been compiled for this movement yet.'
          : 'The live feed for this archived movement has not been compiled.'}
      </div>
    );
  }

  return (
    <>
      <div className="feed-controls">
        <div className="feed-search">
          <input
            type="search"
            value={query}
            placeholder="Search this feed"
            aria-label="Search this feed"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="chip-row" role="group" aria-label="Filter by source">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={source === s}
              onClick={() => setSource(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No articles match your search.</div>
      ) : (
        groups.map((group) => (
          <div className="date-group" key={group.key}>
            <div className="date-header">
              <span className="stamp">{group.key}</span>
              <span className="label">{longDate(group.date)}</span>
            </div>
            {group.items.map((a, i) => (
              <article className="article" key={`${a.url}-${i}`}>
                <div className="article__meta">
                  <span className="article__source">{a.source}</span>
                  <span aria-hidden="true">·</span>
                  <span>{timeAgo(a.date)}</span>
                </div>
                <a
                  className="article__title"
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {a.title}
                  <span className="ext" aria-hidden="true">↗</span>
                </a>
                {a.excerpt && <p className="article__excerpt">{a.excerpt}</p>}
              </article>
            ))}
          </div>
        ))
      )}
    </>
  );
}
