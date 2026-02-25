import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@sparkmotion/api", "@sparkmotion/database", "@sparkmotion/ui", "@sparkmotion/auth"],
  experimental: {
    outputFileTracingIncludes: {
      '/*': ['../../packages/database/generated/**/*'],
    },
  },
};

export default nextConfig;
