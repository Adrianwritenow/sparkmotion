/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/api", "@sparkmotion/database", "@sparkmotion/auth"],
};

export default nextConfig;
