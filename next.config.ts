import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Relay is a live, per-request multiplayer app: no static caching of pages.
  cacheComponents: false,
  // Let other devices (LAN IP, campus hostnames, a Cloudflare quick tunnel) load dev assets.
  allowedDevOrigins: ["10.43.253.125", "*.wifi.berkeley.edu", "**.trycloudflare.com", "**.loca.lt", "**.ngrok-free.app"],
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
