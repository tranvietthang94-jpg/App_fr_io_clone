/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fr-clone/shared'],
  images: {
    domains: ['localhost', '127.0.0.1'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
};

module.exports = nextConfig;