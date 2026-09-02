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
  //
  // ignoreBuildErrors does NOT skip Next's TypeScript *config* validation,
  // which still probes for `typescript/lib/typescript.js`. TS 7 ships no
  // such file, so Next treats `typescript` as missing: off-CI it silently
  // runs `npm install` and carries on, but on CI it throws a FatalError
  // that Next swallows into a bare `process.exit(1)` with no message.
  // The devDependency on `@typescript/native-preview` is what stops that:
  // Next detects it and skips the missing-typescript path entirely. Do not
  // remove it because it looks unused.
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
