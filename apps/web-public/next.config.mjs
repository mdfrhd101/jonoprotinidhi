/** Public MP website (Next.js App Router). Content comes from the Jonoprotinidhi public API; see src/lib/api.ts.
 *  The Content-Security-Policy is set per request (with a nonce) in src/middleware.ts; the static security
 *  headers below apply to every response, including static files. */
const isProd = process.env.NODE_ENV === 'production';

/* STATIC_EXPORT=1 (scripts/build-static.mjs): plain files in `out/` for GitHub Pages at /jonoprotinidhi/. No server means no
   middleware (CSP nonce, demo gate, X-Robots-Tag), no same-origin API proxy (the browser calls the API directly, see
   src/lib/publicApi.ts), no /healthz and no response headers. All of those are .ts files, so `pageExtensions` without "ts"
   leaves them out of the build; every page, layout and component is .tsx. Do not add a page.ts. */
const staticExport = process.env.STATIC_EXPORT === '1';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // the shared package ships TypeScript sources with ESM ".js" import specifiers
  transpilePackages: ['@jonoprotinidhi/shared'],
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  ...(staticExport
    ? {
        output: 'export',
        basePath: '/jonoprotinidhi',
        trailingSlash: true,
        images: { unoptimized: true },
        pageExtensions: ['tsx', 'jsx', 'js'],
        // one export worker: the build shares one per-IP API rate limit and keeps its API reads in memory (src/lib/api.ts)
        experimental: { cpus: 1 },
        // Next gives one page 60 s by default, then kills the worker. A rate-limited or waking API makes src/lib/buildFetch.ts wait
        // longer than that (Retry-After alone can be 60 s), and a killed worker would also lose the reads already made.
        staticPageGenerationTimeout: 300,
      }
    : {
        async headers() {
          return [{ source: '/:path*', headers: securityHeaders }];
        },
      }),
};

export default nextConfig;
