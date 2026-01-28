import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sparkmotion/api", "@sparkmotion/database", "@sparkmotion/ui"],
};

export default nextConfig;
