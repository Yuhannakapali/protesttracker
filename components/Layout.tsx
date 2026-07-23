import Head from 'next/head';
import type { ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

interface Props {
  children: ReactNode;
  title?: string;
  description?: string;
}

const BASE_TITLE = 'ProtestTracker';

export default function Layout({ children, title, description }: Props) {
  const fullTitle = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {description && <meta name="description" content={description} />}
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
