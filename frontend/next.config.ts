import type { NextConfig } from "next";

// NOTE: next.config.ts is build configuration — it reads process.env directly.
// All runtime code (components, pages, API clients) must use `@/config/env` instead.
const backendOrigin = process.env.BACKEND_ORIGIN || "http://localhost:8001";
const devOrigins = (process.env.ALLOWED_DEV_ORIGINS || "localhost,127.0.0.1,192.168.29.61")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
