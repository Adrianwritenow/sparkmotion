import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/database", "@sparkmotion/redis"],
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../.."),
    outputFileTracingIncludes: {
      "/*": [
        "node_modules/.prisma/client/**/*",
        "packages/database/generated/client/**/*",
      ],
    },
  },
};

export default nextConfig;
