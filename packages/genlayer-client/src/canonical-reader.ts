import { createClient } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";
import { configuredContractAddress, FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256, resolveFirewallGenLayerNetwork, resolveFirewallNetworkForEndpoint, resolveFirewallNetworkFromEnv, type FirewallGenLayerNetworkAlias } from "./network-config.js";

const legacyContractAddress = "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528" as const;
export const CANONICAL_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_FIREWALL_STUDIONET_CONTRACT_ADDRESS ?? legacyContractAddress) as `0x${string}`;
export const CANONICAL_CHAIN_ID = 61999 as const;
export const CANONICAL_RPC_URL = "https://studio.genlayer.com/api" as const;
export const CANONICAL_SEMANTIC_SCHEMA = "FIREWALL_MANDATE_V2" as const;
export const CANONICAL_EVIDENCE_SCHEMA = "FIREWALL_EVM_EVIDENCE_V3" as const;
const legacySourceSha256 = "b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163" as const;
export const CANONICAL_SOURCE_SHA256 = (process.env.NEXT_PUBLIC_FIREWALL_CONTRACT_SOURCE_SHA256 ?? legacySourceSha256) as string;
export const CANONICAL_METHODS = [
  "adjudicate_execution", "authenticate_evidence", "commit_execution", "create_mandate",
  "freeze_mandate", "get_adjudications", "get_evidence_schema", "get_executions",
  "get_mandates", "get_permit_status", "get_permits", "get_semantic_keys",
  "get_semantic_schema", "issue_permit",
] as const;
export const CANONICAL_SEMANTIC_KEYS = [
  "intent_satisfied",
  "scope_expanded",
  "prohibited_effect_present",
  "economic_terms_consistent",
  "administrative_authority_changed",
  "implementation_behavior_consistent",
  "evidence_sufficient",
] as const;

export type CanonicalSemanticKey = (typeof CANONICAL_SEMANTIC_KEYS)[number];

export type CanonicalContractConfig = {
  readonly contractAddress: `0x${string}`;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly networkAlias?: FirewallGenLayerNetworkAlias;
  readonly expectedSourceSha256?: string;
};

export type CanonicalMandate = {
  readonly creator: string;
  readonly governanceChainId: number;
  readonly governanceContract: string;
  readonly proposalExternalId: string;
  readonly proposalHash: string;
  readonly proposalSource: string;
  readonly proposalText: string;
  readonly proposalTextSha256: string;
  readonly proposalTextBytes: number;
  readonly mandateVersion: number;
  readonly mandateDigest: string;
  readonly state: string;
  readonly frozenAt: number;
  readonly mandateId: string;
};

export type CanonicalExecution = {
  readonly executionId: string;
  readonly mandateId: string;
  readonly chainId: number;
  readonly expectedFacts: string;
  readonly sourceA: string;
  readonly sourceB: string;
  readonly state: string;
  readonly evidenceJson: string;
  readonly evidenceStatus: string;
  readonly generation: number;
};

export type CanonicalEvidence = {
  readonly executionId: string;
  readonly evidenceStatus: string;
  readonly factsJson: string;
};

export type CanonicalAdjudication = {
  readonly adjudicationId: string;
  readonly executionId: string;
  readonly generation: number;
  readonly intentSatisfied: boolean;
  readonly scopeExpanded: boolean;
  readonly prohibitedEffectPresent: boolean;
  readonly economicTermsConsistent: boolean;
  readonly administrativeAuthorityChanged: boolean;
  readonly implementationBehaviorConsistent: boolean;
  readonly evidenceSufficient: boolean;
  readonly verdict: string;
};

export type CanonicalPermit = {
  readonly permitId: string;
  readonly mandateId: string;
  readonly mandateVersion: number;
  readonly proposalHash: string;
  readonly executionId: string;
  readonly adjudicationId: string;
  readonly generation: number;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly bindingHash: string;
  readonly status: string;
};

export type CanonicalLiveReadModel = {
  readonly status: "READY";
  readonly source: "LIVE_CANONICAL" | "TEST_FIXTURE";
  readonly config: CanonicalContractConfig;
  readonly asOf: string;
  readonly evidenceSchema: string;
  readonly semanticSchema: string;
  readonly semanticKeys: readonly string[];
  readonly mandates: readonly CanonicalMandate[];
  readonly executions: readonly CanonicalExecution[];
  readonly evidence: readonly CanonicalEvidence[];
  readonly adjudications: readonly CanonicalAdjudication[];
  readonly permits: readonly CanonicalPermit[];
  readonly permitStatuses: Readonly<Record<string, string>>;
};

export type CanonicalContractCall = (input: {
  readonly address: `0x${string}`;
  readonly functionName: string;
  readonly args?: readonly unknown[];
}) => Promise<unknown>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`CANONICAL_READ_INVALID:${label}`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`CANONICAL_READ_INVALID:${label}`);
  return value;
}

function integer(value: unknown, label: string): number {
  const parsed = typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`CANONICAL_READ_INVALID:${label}`);
  return parsed;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`CANONICAL_READ_INVALID:${label}`);
  return value;
}

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`CANONICAL_READ_INVALID:${label}`);
  return value;
}

function parseMandate(value: unknown): CanonicalMandate {
  const item = record(value, "mandate");
  return {
    creator: text(item.creator, "mandate.creator"),
    governanceChainId: integer(item.governance_chain_id, "mandate.governance_chain_id"),
    governanceContract: text(item.governance_contract, "mandate.governance_contract"),
    proposalExternalId: text(item.proposal_external_id, "mandate.proposal_external_id"),
    proposalHash: text(item.proposal_hash, "mandate.proposal_hash"),
    proposalSource: text(item.proposal_source, "mandate.proposal_source"),
    proposalText: text(item.proposal_text, "mandate.proposal_text"),
    proposalTextSha256: text(item.proposal_text_sha256, "mandate.proposal_text_sha256"),
    proposalTextBytes: integer(item.proposal_text_bytes, "mandate.proposal_text_bytes"),
    mandateVersion: integer(item.mandate_version, "mandate.mandate_version"),
    mandateDigest: text(item.mandate_digest, "mandate.mandate_digest"),
    state: text(item.state, "mandate.state"),
    frozenAt: integer(item.frozen_at, "mandate.frozen_at"),
    mandateId: text(item.mandate_id, "mandate.mandate_id"),
  };
}

function parseExecution(value: unknown): CanonicalExecution {
  const item = record(value, "execution");
  return {
    executionId: text(item.execution_id, "execution.execution_id"),
    mandateId: text(item.mandate_id, "execution.mandate_id"),
    chainId: integer(item.chain_id, "execution.chain_id"),
    expectedFacts: text(item.expected_facts, "execution.expected_facts"),
    sourceA: text(item.source_a, "execution.source_a"),
    sourceB: text(item.source_b, "execution.source_b"),
    state: text(item.state, "execution.state"),
    evidenceJson: text(item.evidence_json, "execution.evidence_json"),
    evidenceStatus: text(item.evidence_status, "execution.evidence_status"),
    generation: integer(item.generation, "execution.generation"),
  };
}

function parseEvidence(execution: CanonicalExecution): CanonicalEvidence | null {
  if (!execution.evidenceJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(execution.evidenceJson);
  } catch {
    throw new Error(`CANONICAL_READ_INVALID:evidence_json.${execution.executionId}`);
  }
  const facts = record(parsed, `evidence_json.${execution.executionId}`);
  if (execution.evidenceStatus !== "VERIFIED_POST_EXECUTION"
    || facts.schema !== CANONICAL_EVIDENCE_SCHEMA
    || integer(facts.chain_id, `evidence_json.${execution.executionId}.chain_id`) !== execution.chainId
    || facts.finality !== "HISTORICAL"
    || facts.receipt_status !== "SUCCESS"
    || facts.execution_outcome !== "SAFE_EXECUTION_SUCCESS") {
    throw new Error(`CANONICAL_READ_INVALID:evidence_binding.${execution.executionId}`);
  }
  return { executionId: execution.executionId, evidenceStatus: execution.evidenceStatus, factsJson: execution.evidenceJson };
}

function parseAdjudication(value: unknown): CanonicalAdjudication {
  const item = record(value, "adjudication");
  return {
    adjudicationId: text(item.adjudication_id, "adjudication.adjudication_id"),
    executionId: text(item.execution_id, "adjudication.execution_id"),
    generation: integer(item.generation, "adjudication.generation"),
    intentSatisfied: boolean(item.intent_satisfied, "adjudication.intent_satisfied"),
    scopeExpanded: boolean(item.scope_expanded, "adjudication.scope_expanded"),
    prohibitedEffectPresent: boolean(item.prohibited_effect_present, "adjudication.prohibited_effect_present"),
    economicTermsConsistent: boolean(item.economic_terms_consistent, "adjudication.economic_terms_consistent"),
    administrativeAuthorityChanged: boolean(item.administrative_authority_changed, "adjudication.administrative_authority_changed"),
    implementationBehaviorConsistent: boolean(item.implementation_behavior_consistent, "adjudication.implementation_behavior_consistent"),
    evidenceSufficient: boolean(item.evidence_sufficient, "adjudication.evidence_sufficient"),
    verdict: text(item.verdict, "adjudication.verdict"),
  };
}

function parsePermit(value: unknown): CanonicalPermit {
  const item = record(value, "permit");
  return {
    permitId: text(item.permit_id, "permit.permit_id"),
    mandateId: text(item.mandate_id, "permit.mandate_id"),
    mandateVersion: integer(item.mandate_version, "permit.mandate_version"),
    proposalHash: text(item.proposal_hash, "permit.proposal_hash"),
    executionId: text(item.execution_id, "permit.execution_id"),
    adjudicationId: text(item.adjudication_id, "permit.adjudication_id"),
    generation: integer(item.generation, "permit.generation"),
    issuedAt: integer(item.issued_at, "permit.issued_at"),
    expiresAt: integer(item.expires_at, "permit.expires_at"),
    bindingHash: text(item.binding_hash, "permit.binding_hash"),
    status: text(item.status, "permit.status"),
  };
}

export function canonicalConfigFromEnv(env: Record<string, string | undefined>): CanonicalContractConfig {
  const network = resolveFirewallNetworkFromEnv(env);
  const contractAddress = configuredContractAddress(network, env);
  const chainId = env.FIREWALL_CHAIN_ID ?? String(network.chainId);
  const rpcUrl = env.FIREWALL_RPC_URL ?? network.rpcUrl;
  const expectedSourceSha256 = env.FIREWALL_CONTRACT_SOURCE_SHA256 ?? env.NEXT_PUBLIC_FIREWALL_CONTRACT_SOURCE_SHA256 ?? network.sourceSha256;
  if (!contractAddress || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) throw new Error("CANONICAL_CONFIG_INVALID:FIREWALL_CONTRACT_ADDRESS");
  if (!chainId || !/^\d+$/.test(chainId)) throw new Error("CANONICAL_CONFIG_INVALID:FIREWALL_CHAIN_ID");
  if (!rpcUrl || !/^https:\/\//.test(rpcUrl)) throw new Error("CANONICAL_CONFIG_INVALID:FIREWALL_RPC_URL");
  const parsedChainId = Number(chainId);
  if (parsedChainId !== network.chainId) throw new Error("CANONICAL_CONFIG_NETWORK_CHAIN_MISMATCH");
  if (rpcUrl !== network.rpcUrl) throw new Error("CANONICAL_CONFIG_NETWORK_RPC_MISMATCH");
  if (expectedSourceSha256 !== network.sourceSha256 && !(network.alias === "studionet" && expectedSourceSha256 === FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256)) throw new Error("CANONICAL_CONFIG_UNSUPPORTED_SOURCE_HASH");
  return { contractAddress: contractAddress as `0x${string}`, chainId: parsedChainId, rpcUrl, networkAlias: network.alias, expectedSourceSha256 };
}

export class GenLayerCanonicalReader {
  constructor(
    private readonly config: CanonicalContractConfig,
    private readonly call: CanonicalContractCall,
    private readonly verifyDeployment?: () => Promise<void>,
  ) {}

  async read(): Promise<CanonicalLiveReadModel> {
    await this.verifyDeployment?.();
    const read = (functionName: string, args: readonly unknown[] = []) => this.call({ address: this.config.contractAddress, functionName, args });
    // Keep requests sequential. The hosted Studio RPC has returned SQLAlchemy
    // "invalid transaction" errors when several eth_call-backed reads race.
    const evidenceSchema = await read("get_evidence_schema");
    const semanticSchema = await read("get_semantic_schema");
    const semanticKeys = await read("get_semantic_keys");
    const rawMandates = await read("get_mandates");
    const rawExecutions = await read("get_executions");
    const rawAdjudications = await read("get_adjudications");
    const rawPermits = await read("get_permits");
    const mandates = list(rawMandates, "mandates").map(parseMandate);
    const executions = list(rawExecutions, "executions").map(parseExecution);
    const evidence = executions.map(parseEvidence).filter((item): item is CanonicalEvidence => item !== null);
    const adjudications = list(rawAdjudications, "adjudications").map(parseAdjudication);
    const permits = list(rawPermits, "permits").map(parsePermit);
    const permitStatuses: Record<string, string> = {};
    for (const permit of permits) {
      permitStatuses[permit.permitId] = text(await read("get_permit_status", [permit.permitId]), `permit_status.${permit.permitId}`);
    }
    const semanticKeyValues = list(semanticKeys, "semantic_keys").map((key) => text(key, "semantic_key"));
    if (text(evidenceSchema, "evidence_schema") !== CANONICAL_EVIDENCE_SCHEMA) throw new Error("CANONICAL_EVIDENCE_SCHEMA_MISMATCH");
    if (text(semanticSchema, "semantic_schema") !== CANONICAL_SEMANTIC_SCHEMA) throw new Error("CANONICAL_SEMANTIC_SCHEMA_MISMATCH");
    if (semanticKeyValues.length !== CANONICAL_SEMANTIC_KEYS.length || semanticKeyValues.some((key, index) => key !== CANONICAL_SEMANTIC_KEYS[index])) throw new Error("CANONICAL_SEMANTIC_KEYS_MISMATCH");
    return {
      status: "READY",
      source: "LIVE_CANONICAL",
      config: this.config,
      asOf: new Date().toISOString(),
      evidenceSchema: CANONICAL_EVIDENCE_SCHEMA,
      semanticSchema: CANONICAL_SEMANTIC_SCHEMA,
      semanticKeys: semanticKeyValues,
      mandates,
      executions,
      evidence,
      adjudications,
      permits,
      permitStatuses,
    };
  }
}

export function createCanonicalReader(config: CanonicalContractConfig, existingClient?: ReturnType<typeof createClient>): GenLayerCanonicalReader {
  const network = config.networkAlias
    ? resolveFirewallGenLayerNetwork(config.networkAlias)
    : resolveFirewallNetworkForEndpoint(config.chainId, config.rpcUrl);
  if (network.chainId !== config.chainId || network.rpcUrl !== config.rpcUrl) throw new Error("CANONICAL_CONFIG_NETWORK_MISMATCH");
  const verifiedConfig = { ...config, networkAlias: network.alias };
  const expectedSourceSha256 = config.expectedSourceSha256 ?? network.sourceSha256;
  if (expectedSourceSha256 !== network.sourceSha256 && !(network.alias === "studionet" && expectedSourceSha256 === FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256)) throw new Error("CANONICAL_CONFIG_UNSUPPORTED_SOURCE_HASH");
  const chain = network.chain as unknown as Exclude<NonNullable<Parameters<typeof createClient>[0]>["chain"], undefined>;
  const client = existingClient ?? createClient({ chain, endpoint: config.rpcUrl });
  const verifyDeployment = async () => {
    const configuredEndpoints = client.chain.rpcUrls.default.http;
    if (client.chain.id !== network.chainId || !configuredEndpoints.includes(network.rpcUrl)) throw new Error("CANONICAL_DEPLOYMENT_NETWORK_CONFIG_MISMATCH");
    const chainId = await client.getChainId();
    if (chainId !== network.chainId) throw new Error("CANONICAL_DEPLOYMENT_CHAIN_MISMATCH");
    const source = await client.getContractCode(config.contractAddress);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    const sourceHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (sourceHash !== expectedSourceSha256) throw new Error("CANONICAL_DEPLOYMENT_SOURCE_HASH_MISMATCH");
    const schema = await client.getContractSchema(config.contractAddress);
    const methods = Object.keys(schema.methods).sort();
    const views = methods.filter((name) => schema.methods[name]?.readonly === true);
    const writes = methods.filter((name) => schema.methods[name]?.readonly === false);
    if (methods.length !== CANONICAL_METHODS.length || methods.some((name, index) => name !== CANONICAL_METHODS[index]) || views.length !== 8 || writes.length !== 6 || schema.ctor.params.length !== 2) {
      throw new Error("CANONICAL_DEPLOYMENT_SCHEMA_MISMATCH");
    }
  };
  return new GenLayerCanonicalReader(verifiedConfig, (input) => client.readContract({
    address: input.address,
    functionName: input.functionName,
    args: input.args as never[],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  }), verifyDeployment);
}

export function createCanonicalReaderFromEnv(env: Record<string, string | undefined> = process.env): GenLayerCanonicalReader {
  return createCanonicalReader(canonicalConfigFromEnv(env));
}
