/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      console.warn('NEXT_PUBLIC_API_URL not set — API rewrites disabled (set in Vercel project settings)');
      return [];
    }
    return [
      { source: '/api/submit', destination: `${apiUrl}/api/submit` },
      { source: '/api/health', destination: `${apiUrl}/api/health` },
      { source: '/api/user/:path*', destination: `${apiUrl}/api/user/:path*` },
      { source: '/api/data/:path*', destination: `${apiUrl}/api/data/:path*` },
    ];
  },
};

module.exports = nextConfig;
