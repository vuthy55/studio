
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GOOGLE_SEARCH_ENGINE_ID: process.env.GOOGLE_SEARCH_ENGINE_ID,
    PAYPAL_MODE: process.env.NODE_ENV === 'production' ? 'live' : 'sandbox',
    PAYPAL_CLIENT_ID_LIVE: process.env.PAYPAL_CLIENT_ID_LIVE,
    PAYPAL_CLIENT_SECRET_LIVE: process.env.PAYPAL_CLIENT_SECRET_LIVE,
    NEXT_PUBLIC_PAYPAL_CLIENT_ID_LIVE: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_LIVE,
  }
};

export default nextConfig;

    