import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import LiveDot from '@/components/LiveDot';
import { isActiveStatus } from '@/lib/status';
import type { Movement } from '@/lib/types';

// A movement summary card used on Home and Archive. Latest headlines are
// only rendered when `showHeadlines` is set (Home).
export default function MovementCard({
  movement,
  showHeadlines = false,
}: {
  movement: Movement;
  showHeadlines?: boolean;
}) {
  const heads = (movement.latestHeadlines || []).slice(0, 3);
  return (
    <Link href={`/movements/${movement.id}/`} className="movement-card">
      <div className="movement-card__top">
        <StatusBadge status={movement.status} />
        <span className="movement-card__loc">{movement.location}</span>
      </div>
      <div>
        <h3 className="movement-card__name">{movement.name}</h3>
        <p className="movement-card__desc">{movement.description}</p>
      </div>
      <div className="movement-card__meta">
        <span>
          {movement.articleCount} article{movement.articleCount === 1 ? '' : 's'}
        </span>
        <span>updated {movement.updated}</span>
        {isActiveStatus(movement.status) && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <LiveDot /> live
          </span>
        )}
      </div>
      {showHeadlines && heads.length > 0 && (
        <ul className="movement-card__heads">
          {heads.map((h, i) => (
            <li key={i}>
              <span className="src">{h.source}</span>
              <span className="ttl">{h.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
