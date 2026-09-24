import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js ignores the stray package-lock.json
  // in the parent home directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      // Document uploads (src/server/services/document-service.ts) cap files
      // at 10 MB; the default action body limit is 1 MB.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
