import Head from 'next/head';
import type { ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  DEFAULT_OG_IMAGE,
  GOOGLE_SITE_VERIFICATION,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
  bestTitle,
} from '@/lib/seo';

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
  /**
   * Site-relative path of this page's Open Graph card. Defaults to the site
   * card; movement pages pass their own.
   */
  image?: string;
  /**
   * Path prefix of this page's syndication feeds, without the extension —
   * "/feed" resolves to /feed.xml and /feed.json. Movement pages point at
   * their own feed so a reader subscribing from that page follows only it.
   */
  feed?: string;
}


export default function Layout({
  children,
  title,
  description,
  path,
  jsonLd,
  image = DEFAULT_OG_IMAGE,
  feed = '/feed',
}: Props) {
  // Brand suffix only while the whole title still fits the SERP. Pages whose
  // own title is already long keep the words a searcher typed instead.
  const fullTitle = title
    ? bestTitle([`${title} · ${SITE_NAME}`, title])
    : `${SITE_NAME} — ${SITE_TAGLINE}`;
  const metaDescription = description || SITE_DESCRIPTION;
  const canonical = path ? absoluteUrl(path) : null;
  // Absolute: relative image URLs are ignored by every social crawler.
  const ogImage = absoluteUrl(image);

  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={metaDescription} />
        {GOOGLE_SITE_VERIFICATION && (
          <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />
        )}
        {canonical && <link rel="canonical" href={canonical} />}
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${fullTitle} (RSS)`}
          href={absoluteUrl(`${feed}.xml`)}
        />
        <link
          rel="alternate"
          type="application/feed+json"
          title={`${fullTitle} (JSON Feed)`}
          href={absoluteUrl(`${feed}.json`)}
        />

        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={metaDescription} />
        {canonical && <meta property="og:url" content={canonical} />}
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
        <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
        <meta property="og:image:alt" content={fullTitle} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
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
      <Footer feed={feed} />
    </>
  );
}
