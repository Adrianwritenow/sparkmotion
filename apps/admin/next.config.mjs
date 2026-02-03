/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/api", "@sparkmotion/database", "@sparkmotion/ui", "@sparkmotion/auth"],
};

export default nextConfig;
