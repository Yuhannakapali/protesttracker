// Canonical origin for the site. Absolute URLs are required for canonical
// links, Open Graph and JSON-LD — relative ones are ignored by crawlers.
// Kept in sync with public/CNAME by hand; it changes at most once.
export const SITE_URL = 'https://protesttracker.net';

export const SITE_NAME = 'ProtestTracker';

export const SITE_DESCRIPTION =
  'An independent, automatically updated archive documenting major protest movements around the world.';

// Build an absolute URL from a site-relative path. `trailingSlash: true`
// in next.config.js means every route is served with a trailing slash, so
// canonicals must carry one too or they point at a redirect.
export function absoluteUrl(path: string): string {
  if (!path.startsWith('/')) return `${SITE_URL}/${path}`;
  return `${SITE_URL}${path}`;
}
