import path from 'node:path';
import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The e2e suite runs its own dev server next to a regular one, so it gets its own build directory.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  ...(process.env.NEXT_TSCONFIG ? { typescript: { tsconfigPath: process.env.NEXT_TSCONFIG } } : {}),
  // Docker image builds set NEXT_STANDALONE=1 to get a self-contained server bundle.
  ...(process.env.NEXT_STANDALONE === '1' ? { output: 'standalone' as const, outputFileTracingRoot: path.join(process.cwd(), '../../') } : {}),
  transpilePackages: ['@lims/shared'],
  poweredByHeader: false,
  // The browser talks only to the Next.js origin; API calls are proxied so the session cookie
  // stays first-party (SameSite=Lax, httpOnly) and no CORS is needed.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
  async headers() {
    return [
      // The service worker must be re-checked on every load so a new release reaches installed apps.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
