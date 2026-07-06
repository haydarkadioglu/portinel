import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel handles the build pipeline natively — no standalone output.
  // For self-hosting/Docker, use the master branch which has output: "standalone".
};

export default nextConfig;
