import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: [
    "@firewall/domain",
    "@firewall/evidence",
    "@firewall/evm-analyzer",
    "@firewall/genlayer-client",
    "@firewall/governance-adapters",
    "@firewall/indexer",
    "@firewall/policy-engine",
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
