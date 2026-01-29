/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sparkmotion/ui", "@sparkmotion/auth"],
  serverExternalPackages: ["@prisma/client"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./.prisma/client/**"],
  },
};

export default nextConfig;
