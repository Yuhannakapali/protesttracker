// Outbound link policy.

const GOOGLE_NEWS = /(^|\.)news\.google\.com$/i;

/**
 * Most headlines reach us as Google News redirect URLs rather than publisher
 * links. Those pass no value to the outlet that did the reporting and would
 * hand a single redirector the bulk of the site's outbound links, so they are
 * marked nofollow. A direct publisher link stays followed — the credit
 * belongs to them.
 */
export function outboundRel(url: string): string {
  const base = 'noopener noreferrer';
  try {
    return GOOGLE_NEWS.test(new URL(url).hostname) ? `${base} nofollow` : base;
  } catch {
    return `${base} nofollow`;
  }
}
