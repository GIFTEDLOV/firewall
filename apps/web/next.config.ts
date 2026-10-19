import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the Playwright dev server isolated from the production build output.
  distDir: process.env.FIREWALL_NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: [
    "@firewall/domain",
    "@firewall/evidence",
    "@firewall/evm-analyzer",
    "@firewall/genlayer-client",
    "@firewall/governance-adapters",
    "@firewall/indexer",
    "@firewall/policy-engine",
    "@firewall/safe-enforcement",
    "@firewall/shared",
    "@firewall/workflow",
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
