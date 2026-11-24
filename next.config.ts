import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Test fixtures never ship. The e2e seam that reads tests/e2e/fixtures (src/lib/testing/fixtureMode.ts) is
  // compiled out of production builds, but the file tracer would still copy the recording into each function.
  outputFileTracingExcludes: { '/**': ['./tests/**/*'] },
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
