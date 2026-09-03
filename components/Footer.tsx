interface Props {
  /** Feed path prefix for this page, matching the one Layout advertises. */
  feed?: string;
}

export default function Footer({ feed = '/feed' }: Props) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p>
          Independently maintained archive. Not affiliated with any political group, party, or
          government.
        </p>
        <p className="site-footer__feeds">
          <a href="/search/">Search</a> · Subscribe: <a href={`${feed}.xml`}>RSS</a> ·{' '}
          <a href={`${feed}.json`}>JSON Feed</a>
        </p>
      </div>
    </footer>
  );
}
