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
};

export default nextConfig;
