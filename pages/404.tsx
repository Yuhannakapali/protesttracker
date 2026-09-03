import Link from 'next/link';
import Layout from '@/components/Layout';

// Next ships a bare 404 with no shell. A crawler that lands here — from an old
// URL, or a movement that was renamed — should still find its way into the
// site rather than hitting a dead end.
export default function NotFound() {
  return (
    <Layout title="Page not found" description="That page does not exist on ProtestTracker.">
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">404</p>
          <h1>Page not found</h1>
          <p className="lede">
            That page does not exist. It may have been renamed, or the link that brought you here
            may be out of date.
          </p>
        </div>
        <div className="section-pad">
          <ul className="search-page__movements">
            <li>
              <Link href="/">Movements now</Link>
              <span>Active and escalating coverage</span>
            </li>
            <li>
              <Link href="/archive/">Archive</Link>
              <span>Quiet, dormant and concluded movements</span>
            </li>
            <li>
              <Link href="/search/">Search</Link>
              <span>Every article in the archive</span>
            </li>
            <li>
              <Link href="/about/">About</Link>
              <span>How this archive is compiled</span>
            </li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
