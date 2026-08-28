/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    /*
      Voice notes post through a server action, and the default cap on an
      action body is 1MB — enough to reject a recording of about a minute.
      4mb sits just under the platform's own ~4.5MB request limit, which is
      the real ceiling; the recorder stops itself well before either.
    */
    serverActions: { bodySizeLimit: '4mb' },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
