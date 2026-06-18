/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Suppress build errors on individual page failures during static gen
  // All dynamic pages should be marked force-dynamic
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;
