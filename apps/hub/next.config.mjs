/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/database", "@sparkmotion/redis"],
};

export default nextConfig;
