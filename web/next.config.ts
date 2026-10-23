import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The site imports ../src/policy.ts from the agent, so the bundler root is the repo.
  turbopack: { root: path.join(__dirname, "..") },
  outputFileTracingRoot: path.join(__dirname, ".."),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/embed/counter",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
