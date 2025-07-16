import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Add a rule to ignore the .genkit directory
    config.watchOptions = {
        ...config.watchOptions,
        ignored: [
            ...(config.watchOptions.ignored as string[] || []),
            '**/.genkit/**',
        ],
    };
    return config;
  },
};

export default nextConfig;
