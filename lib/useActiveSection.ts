import { useEffect, useState } from 'react';

// Tracks which section is currently in view, for highlighting the sticky
// sub-nav. Observes the given element ids and reports the topmost one that
// is intersecting.
export function useActiveSection(ids: string[], deps: unknown[] = []): string {
  const [active, setActive] = useState<string>(ids[0] || '');

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      // Bias the active zone just below the sticky header + sub-nav.
      { rootMargin: '-140px 0px -55% 0px', threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return active;
}
