/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,

  // TypeScript 7 (the native compiler) has no JS compiler API, so Next's
  // in-build "Running TypeScript" pass cannot load it. We skip that single
  // step and use the native `tsc` binary as the source of truth for type
  // safety instead: `npm run typecheck`, run locally and in CI before the
  // build. (Next 16 no longer runs ESLint during the build at all.)
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
