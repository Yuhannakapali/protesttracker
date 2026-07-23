import { useTheme } from '@/lib/theme';

// Light/dark toggle showing a glyph + label. The label is hidden under
// 400px via CSS (.theme-toggle__label).
export default function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      <span className="theme-toggle__glyph" aria-hidden="true">
        {isDark ? '☀' : '☽'}
      </span>
      <span className="theme-toggle__label">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
