import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/database", "@sparkmotion/redis"],
  outputFileTracingIncludes: {
    "/**/*": [
      "node_modules/.prisma/client/**",
      "node_modules/.pnpm/**/.prisma/client/**",
    ],
  },
  outputFileTracingRoot: path.join(__dirname, "../.."),
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default nextConfig;
