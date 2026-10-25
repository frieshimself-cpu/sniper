import type { NextConfig } from "next";
import path from "node:path";

// STATIC_EXPORT=1 builds a read-only copy of the site for GitHub Pages (no votes, no admin).
const STATIC = process.env.STATIC_EXPORT === "1";
const basePath = process.env.BASE_PATH?.replace(/\/$/, "") || "";

const nextConfig: NextConfig = {
  // The site imports ../src/policy.ts from the agent, so the bundler root is the repo.
  turbopack: { root: path.join(__dirname, "..") },
  outputFileTracingRoot: path.join(__dirname, ".."),
  poweredByHeader: false,
  ...(STATIC
    ? { output: "export", basePath, trailingSlash: true, images: { unoptimized: true } }
    : {
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
      }),
};

export default nextConfig;
