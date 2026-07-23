import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { serif, sans, mono } from '@/lib/fonts';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      style={{ display: 'contents' }}
    >
      <Component {...pageProps} />
    </div>
  );
}
