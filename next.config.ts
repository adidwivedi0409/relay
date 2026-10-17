import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Relay is a live, per-request multiplayer app: no static caching of pages.
  cacheComponents: false,
  serverExternalPackages: ["freestyle"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
