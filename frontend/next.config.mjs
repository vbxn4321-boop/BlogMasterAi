import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['*.ngrok-free.app', '*.ngrok-free.dev', '*.ngrok.io', '*.ngrok.app'],
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
