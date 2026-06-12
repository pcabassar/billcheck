import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@billcheck/shared", "@billcheck/engine"],
};

export default nextConfig;
