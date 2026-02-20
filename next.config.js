/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    if (!process.env.NEXT_PUBLIC_API_URL) {
      throw new Error('NEXT_PUBLIC_API_URL environment variable is required');
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    return [
      { source: '/api/submit', destination: `${apiUrl}/api/submit` },
      { source: '/api/health', destination: `${apiUrl}/api/health` },
      { source: '/api/user/:path*', destination: `${apiUrl}/api/user/:path*` },
      { source: '/api/data/:path*', destination: `${apiUrl}/api/data/:path*` },
    ];
  },
};

module.exports = nextConfig;
