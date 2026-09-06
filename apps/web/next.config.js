const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained build output for the production Docker image — bundles a
  // minimal server + traced deps so the runtime stage doesn't ship the whole
  // node_modules. outputFileTracingRoot points at the monorepo root so tracing
  // picks up @r-frame/shared and hoisted deps (server.js lands at
  // apps/web/server.js in the standalone tree).
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@r-frame/shared'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
};

module.exports = nextConfig;