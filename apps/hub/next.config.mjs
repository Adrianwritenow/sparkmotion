import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/database", "@sparkmotion/redis"],
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
    outputFileTracingRoot: path.join(__dirname, "../.."),
    outputFileTracingIncludes: {
      '/*': ['../../packages/database/generated/**/*'],
    },
  },
};

export default nextConfig;
