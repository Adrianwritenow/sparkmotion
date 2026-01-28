/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/api", "@sparkmotion/database", "@sparkmotion/ui", "@sparkmotion/auth"],
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default nextConfig;
