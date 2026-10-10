/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
      {
        source: '/output/:path*',
        destination: 'http://127.0.0.1:8000/output/:path*',
      },
      {
        source: '/worker_faces/:path*',
        destination: 'http://127.0.0.1:8000/worker_faces/:path*',
      },
    ];
  },
};

export default nextConfig;
