import localFont from 'next/font/local';

// Self-hosted fonts (woff2 committed under /fonts). Using next/font/local
// removes any build-time network dependency on Google Fonts, so the build
// works in restricted/offline CI environments. Newsreader and IBM Plex
// Sans are variable fonts (one file, full weight range); IBM Plex Mono
// ships as static instances.

export const serif = localFont({
  src: [{ path: '../fonts/newsreader.woff2', weight: '400 600', style: 'normal' }],
  variable: '--font-serif',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const sans = localFont({
  src: [{ path: '../fonts/ibm-plex-sans.woff2', weight: '400 600', style: 'normal' }],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
});

export const mono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
});
