import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Images from dicebear (used in seed data org logos) and unsplash (admin avatars)
  images: {
    remotePatterns: [
      { hostname: 'api.dicebear.com' },
      { hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
