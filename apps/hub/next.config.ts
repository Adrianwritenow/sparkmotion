import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sparkmotion/database", "@sparkmotion/redis"],
};

export default nextConfig;
