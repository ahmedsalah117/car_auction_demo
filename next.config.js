/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // This is important for Socket.IO to work properly
  experimental: {
    serverComponentsExternalPackages: ["socket.io"],
  },
};

module.exports = nextConfig;
