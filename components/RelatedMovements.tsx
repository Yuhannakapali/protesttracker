import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import { regionSlug } from '@/lib/regions';
import type { Movement } from '@/lib/types';

// Movement pages are otherwise leaves: a reader who arrives on one from a
// search result has nowhere to go but the header. Same region first, since
// that is the nearest relation the data actually asserts.
const MAX = 3;

export default function RelatedMovements({
  current,
  movements,
}: {
  current: Movement;
  movements: Movement[];
}) {
  const others = movements.filter((m) => m.id !== current.id);
  const sameRegion = others.filter((m) => m.region === current.region);
  const rest = others.filter((m) => m.region !== current.region);
  const related = [...sameRegion, ...rest].slice(0, MAX);

  if (related.length === 0) return null;

  return (
    <section className="mv-section related" aria-labelledby="related-heading">
      <div className="mv-section__head">
        <h2 id="related-heading">Elsewhere in the archive</h2>
        <Link className="related__all" href={`/regions/${regionSlug(current.region)}/`}>
          All {current.region} movements →
        </Link>
      </div>
      <ul className="related__list">
        {related.map((m) => (
          <li key={m.id}>
            <Link href={`/movements/${m.id}/`}>
              <span className="related__name">{m.name}</span>
              <span className="related__meta">
                <StatusBadge status={m.status} /> {m.location}
              </span>
            </Link>
            <p className="related__desc">{m.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
