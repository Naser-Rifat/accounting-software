import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js ignores the stray package-lock.json
  // in the parent home directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
