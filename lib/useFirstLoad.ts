import { useEffect, useState } from 'react';

// Returns `true` while a brief (~750ms) skeleton delay is active on first
// load, then flips to `false`. If reduced-motion is requested, the delay
// is skipped entirely. Skeletons show until BOTH the delay has elapsed
// AND `ready` is true.
export function useFirstLoad(ready: boolean, delay = 750): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setElapsed(true);
      return undefined;
    }
    const t = setTimeout(() => setElapsed(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return !(elapsed && ready);
}
