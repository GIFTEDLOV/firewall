import { studionet, testnetBradbury } from "genlayer-js/chains";

export type FirewallGenLayerNetworkAlias = "testnet-bradbury" | "studionet";

const candidateSourceSha256 = "b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163" as const;
const candidateSchemaSha256 = "b313e74d96845f21eae755cdf60329f8c8306ff57f461a9459b42f70f2ae0eca" as const;
export const FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256 = "94b0d8eb7ca8650b87d46eae6a3cc17fc264fef58aefa38c78782bf3f3b3f85f" as const;

export const FIREWALL_GENLAYER_NETWORKS = {
  "testnet-bradbury": {
    alias: "testnet-bradbury",
    role: "FALLBACK",
    chainId: 4221,
    rpcUrl: "https://rpc-bradbury.genlayer.com",
    explorerUrl: "https://explorer-bradbury.genlayer.com/",
    chain: testnetBradbury,
    contractAddress: null,
    sourceSha256: candidateSourceSha256,
    schemaSha256: candidateSchemaSha256,
    deploymentManifest: "provenance/v2-bradbury-deployment.json",
    walletManifest: "evidence/qualification/bradbury/wallet.json",
    transactionJournal: "evidence/qualification/bradbury/transactions.json",
    feeProfile: "artifacts/fees/testnet-bradbury.json",
  },
  studionet: {
    alias: "studionet",
    role: "PRIMARY",
    chainId: 61999,
    rpcUrl: "https://studio.genlayer.com/api",
    explorerUrl: "https://explorer-studio.genlayer.com/",
    chain: studionet,
    contractAddress: "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528" as const,
    sourceSha256: candidateSourceSha256,
    schemaSha256: candidateSchemaSha256,
    deploymentManifest: "provenance/v2-studionet-deployment.json",
    walletManifest: "evidence/qualification/studionet/wallet.json",
    transactionJournal: "evidence/qualification/studionet/transactions.json",
    feeProfile: "artifacts/fees/studionet.json",
  },
} as const;

export function resolveFirewallGenLayerNetwork(alias: string) {
  if (alias !== "testnet-bradbury" && alias !== "studionet") throw new Error("GENLAYER_NETWORK_UNSUPPORTED");
  return FIREWALL_GENLAYER_NETWORKS[alias];
}

/** Resolve only by a full endpoint/chain pair. Chain ID alone is ambiguous: Asimov also uses 4221. */
export function resolveFirewallNetworkForEndpoint(chainId: number, rpcUrl: string) {
  const match = Object.values(FIREWALL_GENLAYER_NETWORKS).find((network) => network.chainId === chainId && network.rpcUrl === rpcUrl);
  if (!match) throw new Error("GENLAYER_NETWORK_ENDPOINT_UNSUPPORTED");
  return match;
}

export function resolveFirewallNetworkFromEnv(env: Record<string, string | undefined>) {
  const configuredAlias = env.FIREWALL_NETWORK_ALIAS;
  if (configuredAlias) return resolveFirewallGenLayerNetwork(configuredAlias);

  // The production application is bound to the verified Studionet V2
  // deployment by default. Any partially specified network remains an error.
  if (env.FIREWALL_CHAIN_ID === undefined && env.FIREWALL_RPC_URL === undefined) {
    return FIREWALL_GENLAYER_NETWORKS.studionet;
  }

  // Preserve the already deployed Studionet application configuration. A 4221
  // deployment must always name Bradbury explicitly because Asimov shares it.
  if (env.FIREWALL_CHAIN_ID === "61999" && env.FIREWALL_RPC_URL === FIREWALL_GENLAYER_NETWORKS.studionet.rpcUrl) {
    return FIREWALL_GENLAYER_NETWORKS.studionet;
  }
  if (env.FIREWALL_CHAIN_ID === "4221") throw new Error("GENLAYER_NETWORK_ALIAS_REQUIRED_FOR_SHARED_CHAIN_ID");
  throw new Error("GENLAYER_NETWORK_ALIAS_REQUIRED");
}

export function configuredContractAddress(network: ReturnType<typeof resolveFirewallGenLayerNetwork>, env: Record<string, string | undefined>): string | undefined {
  const networkSpecific = network.alias === "testnet-bradbury"
    ? env.FIREWALL_BRADBURY_CONTRACT_ADDRESS
    : env.FIREWALL_STUDIONET_CONTRACT_ADDRESS ?? env.FIREWALL_CONTRACT_ADDRESS;
  if (!networkSpecific) return network.contractAddress ?? undefined;
  if (network.contractAddress && networkSpecific.toLowerCase() !== network.contractAddress.toLowerCase()) {
    const candidateSource = env.FIREWALL_CONTRACT_SOURCE_SHA256 ?? env.NEXT_PUBLIC_FIREWALL_CONTRACT_SOURCE_SHA256;
    if (network.alias !== "studionet" || candidateSource !== FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256) throw new Error("GENLAYER_CONTRACT_DOES_NOT_MATCH_NETWORK_MANIFEST");
  }
  return networkSpecific;
}
