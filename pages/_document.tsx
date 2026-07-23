import { Html, Head, Main, NextScript } from 'next/document';

// Inline, render-blocking theme script: applies the saved theme (cookie)
// or the system preference before first paint to avoid a flash. No
// localStorage is used.
const themeScript = `
(function () {
  try {
    var m = document.cookie.match(/(?:^|; )pt-theme=(dark|light)/);
    var theme = m ? m[1] : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta
          name="description"
          content="An independent, automatically updated archive documenting major protest movements around the world."
        />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%23c1402b'/%3E%3C/svg%3E"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
