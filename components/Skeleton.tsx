// Shimmer skeletons shown briefly on first load. Suppressed under
// prefers-reduced-motion via CSS.

export function SkeletonCard() {
  return <div className="skeleton skeleton-card" aria-hidden="true" />;
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="card-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonLines({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-line"
          style={{ width: `${90 - (i % 3) * 18}%` }}
        />
      ))}
    </div>
  );
}
