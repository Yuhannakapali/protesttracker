import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

// Reads the current theme from the DOM attribute set by the inline script
// in _document, and lets the user toggle it. Persists to a cookie (no
// localStorage). Returns [theme, toggle].
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'light';
    setTheme(current);
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      // 1 year, root path.
      document.cookie = `pt-theme=${next};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  };

  return [theme, toggle];
}
