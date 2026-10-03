import type { NextConfig } from "next";

// Static export: the app is plain HTML/JS/CSS + local data files; no server, no runtime APIs.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
