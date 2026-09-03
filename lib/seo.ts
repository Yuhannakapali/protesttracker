// Canonical origin for the site. Absolute URLs are required for canonical
// links, Open Graph and JSON-LD — relative ones are ignored by crawlers.
// Kept in sync with public/CNAME by hand; it changes at most once.
export const SITE_URL = 'https://protesttracker.net';

export const SITE_NAME = 'ProtestTracker';

// Used as the homepage title suffix and wherever the site needs a one-line
// self-description shorter than SITE_DESCRIPTION.
export const SITE_TAGLINE = 'Live Archive of Global Protest Movements';

export const SITE_DESCRIPTION =
  'An independent, automatically updated archive documenting major protest movements around the world.';

// Build an absolute URL from a site-relative path. `trailingSlash: true`
// in next.config.js means every route is served with a trailing slash, so
// canonicals must carry one too or they point at a redirect.
export function absoluteUrl(path: string): string {
  if (!path.startsWith('/')) return `${SITE_URL}/${path}`;
  return `${SITE_URL}${path}`;
}

// Search Console / Bing verification. Set as a build-time environment
// variable (a repository secret in CI) rather than committed, and rendered
// only when present — an empty tag verifies nothing.
export const GOOGLE_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '';

// Open Graph cards are generated per movement by scripts/og-images.mjs.
export const DEFAULT_OG_IMAGE = '/og/default.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

// Google truncates the SERP title around here. Everything below is written
// to land under it rather than to be cut mid-word.
const TITLE_MAX = 60;

/**
 * Pick the richest title that still fits. Brand-suffixed first, because a
 * recognised name lifts click-through; then the intent-qualified form for
 * pages whose own name is already long; then the bare name.
 */
export function bestTitle(candidates: string[]): string {
  return candidates.find((t) => t.length <= TITLE_MAX) || candidates[candidates.length - 1];
}

/**
 * The country a movement is in. `location` is stored as
 * "Nigeria · Lagos & Abuja", so the country is everything before the dot.
 * It matters because searches name the country first — "nigeria fuel
 * subsidy protests" — while the movement name alone never does.
 */
export function movementCountry(location: string): string {
  return (location || '').split('·')[0].trim();
}

/** "Nigeria Fuel Subsidy Protests" — country prefixed unless already there. */
export function movementHeading(name: string, location: string): string {
  const country = movementCountry(location);
  if (!country || name.toLowerCase().includes(country.toLowerCase())) return name;
  return `${country} ${name}`;
}

export function movementTitle(name: string, location: string): string {
  const heading = movementHeading(name, location);
  return bestTitle([
    `${heading} — Timeline & Coverage`,
    `${heading} · ${SITE_NAME}`,
    heading,
  ]);
}

/**
 * Meta descriptions run to about 155 characters in the SERP. The curated
 * summary is the useful part, so the appended detail is kept short enough
 * that the summary survives intact.
 */
export function movementDescription(description: string, articleCount: number): string {
  const suffix = ` · ${articleCount} sourced reports, timeline and legal tracker.`;
  const room = 155 - suffix.length;
  const head = description.length <= room ? description : `${description.slice(0, room - 1).trimEnd()}…`;
  return head + suffix;
}

/**
 * The publisher node, referenced by @id from every other graph so search
 * engines resolve one organisation rather than a copy per page.
 */
export const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  description: SITE_DESCRIPTION,
};
