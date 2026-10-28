import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app lives in a subfolder of another repo; pin the root so Next
  // doesn't pick up the parent's lockfile.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // We render <img> tags ourselves; turning the optimizer off removes the
  // /_next/image endpoint and its attack surface.
  images: { unoptimized: true },
  poweredByHeader: false,
  // Security headers on every response. HTTPS itself is Cloudflare's (tunnel).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
