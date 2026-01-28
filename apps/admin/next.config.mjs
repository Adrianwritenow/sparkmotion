import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/api", "@sparkmotion/database", "@sparkmotion/ui", "@sparkmotion/auth"],
  outputFileTracingIncludes: {
    "/**/*": [
      "node_modules/.prisma/client/**",
      "node_modules/.pnpm/**/.prisma/client/**",
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
