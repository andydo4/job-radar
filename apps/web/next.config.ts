import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root has its own package-lock.json (the poller). Pin this app's root
  // so Next.js doesn't treat the whole repo as the workspace.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
