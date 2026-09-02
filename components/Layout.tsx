import Head from 'next/head';
import type { ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from '@/lib/seo';

interface Props {
  children: ReactNode;
  title?: string;
  description?: string;
  /**
   * Site-relative path of this page, with a trailing slash (e.g. "/archive/").
   * Used for the canonical link and og:url. Omitting it drops both rather
   * than emitting a wrong one — a canonical pointing at the wrong URL is
   * worse than none at all.
   */
  path?: string;
  /** JSON-LD structured data, serialised into a script tag in <head>. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const BASE_TITLE = SITE_NAME;

export default function Layout({ children, title, description, path, jsonLd }: Props) {
  const fullTitle = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
  const metaDescription = description || SITE_DESCRIPTION;
  const canonical = path ? absoluteUrl(path) : null;

  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={metaDescription} />
        {canonical && <link rel="canonical" href={canonical} />}

        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={metaDescription} />
        {canonical && <meta property="og:url" content={canonical} />}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={metaDescription} />

        {jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )}
      </Head>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <main id="main" className="page">
        {children}
      </main>
      <Footer />
    </>
  );
}
