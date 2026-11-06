import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local development database (PGlite, lib/db/index.ts) loads its WebAssembly at run time: do not bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
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
