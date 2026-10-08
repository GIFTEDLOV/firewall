import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

export const CANONICAL_CONTRACT_ADDRESS = "0xEFD65978F54318349139c93c1576ED3eb6f187b6" as const;
export const CANONICAL_CHAIN_ID = 61997 as const;
export const CANONICAL_RPC_URL = "https://studio-dev.genlayer.com/api" as const;

export const CANONICAL_SEMANTIC_SCHEMA = "FIREWALL_MANDATE_V1" as const;
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
};

export type CanonicalMandate = {
  readonly creator: string;
  readonly frozenAt: number;
  readonly governanceChainId: number;
  readonly governanceContract: string;
  readonly mandateDigest: string;
  readonly mandateId: string;
  readonly mandateVersion: number;
  readonly proposalExternalId: string;
  readonly proposalHash: string;
  readonly proposalSource: string;
  readonly proposalText: string;
  readonly proposalTextBytes: number;
  readonly proposalTextSha256: string;
  readonly state: string;
};

export type CanonicalExecution = {
  readonly bundleHash: string;
  readonly calldataDigest: string;
  readonly chainId: number;
  readonly codeFactsDigest: string;
  readonly evidenceHash: string;
  readonly executionId: string;
  readonly expectedEvidenceHash: string;
  readonly generation: number;
  readonly implementationHashesDigest: string;
  readonly mandateId: string;
  readonly semanticInput: string;
  readonly state: string;
  readonly targetCodeHashesDigest: string;
  readonly targetsDigest: string;
  readonly valuesDigest: string;
};

export type CanonicalEvidence = {
  readonly authenticatedAt: number;
  readonly authorityDigest: string;
  readonly contentSha256: string;
  readonly evidenceHash: string;
  readonly exactByteLength: number;
  readonly executionId: string;
  readonly schemaVersion: string;
  readonly sourceDigest: string;
};

export type CanonicalAdjudication = {
  readonly adjudicationId: string;
  readonly administrativeAuthorityChanged: boolean;
  readonly createdAt: number;
  readonly economicTermsConsistent: boolean;
  readonly evidenceHash: string;
  readonly evidenceSufficient: boolean;
  readonly executionId: string;
  readonly generation: number;
  readonly implementationBehaviorConsistent: boolean;
  readonly intentSatisfied: boolean;
  readonly mandateId: string;
  readonly prohibitedEffectPresent: boolean;
  readonly scopeExpanded: boolean;
  readonly semanticSchema: string;
  readonly verdict: string;
};

export type CanonicalPermit = {
  readonly adjudicationGeneration: number;
  readonly adjudicationId: string;
  readonly calldataDigest: string;
  readonly chainId: number;
  readonly executionBundleHash: string;
  readonly executionId: string;
  readonly expiresAt: number;
  readonly implementationHashesDigest: string;
  readonly issuedAt: number;
  readonly mandateId: string;
  readonly mandateVersion: number;
  readonly permitBindingHash: string;
  readonly permitId: string;
  readonly proposalHash: string;
  readonly semanticSchema: string;
  readonly status: string;
  readonly targetCodeHashesDigest: string;
  readonly targetsDigest: string;
  readonly valuesDigest: string;
};

export type CanonicalLiveReadModel = {
  readonly status: "READY";
  readonly config: CanonicalContractConfig;
  readonly asOf: string;
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`CANONICAL_READ_INVALID:${label}`);
  }
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
    frozenAt: integer(item.frozen_at, "mandate.frozen_at"),
    governanceChainId: integer(item.governance_chain_id, "mandate.governance_chain_id"),
    governanceContract: text(item.governance_contract, "mandate.governance_contract"),
    mandateDigest: text(item.mandate_digest, "mandate.mandate_digest"),
    mandateId: text(item.mandate_id, "mandate.mandate_id"),
    mandateVersion: integer(item.mandate_version, "mandate.mandate_version"),
    proposalExternalId: text(item.proposal_external_id, "mandate.proposal_external_id"),
    proposalHash: text(item.proposal_hash, "mandate.proposal_hash"),
    proposalSource: text(item.proposal_source, "mandate.proposal_source"),
    proposalText: text(item.proposal_text, "mandate.proposal_text"),
    proposalTextBytes: integer(item.proposal_text_bytes, "mandate.proposal_text_bytes"),
    proposalTextSha256: text(item.proposal_text_sha256, "mandate.proposal_text_sha256"),
    state: text(item.state, "mandate.state"),
  };
}

function parseExecution(value: unknown): CanonicalExecution {
  const item = record(value, "execution");
  return {
    bundleHash: text(item.bundle_hash, "execution.bundle_hash"),
    calldataDigest: text(item.calldata_digest, "execution.calldata_digest"),
    chainId: integer(item.chain_id, "execution.chain_id"),
    codeFactsDigest: text(item.code_facts_digest, "execution.code_facts_digest"),
    evidenceHash: text(item.evidence_hash, "execution.evidence_hash"),
    executionId: text(item.execution_id, "execution.execution_id"),
    expectedEvidenceHash: text(item.expected_evidence_hash, "execution.expected_evidence_hash"),
    generation: integer(item.generation, "execution.generation"),
    implementationHashesDigest: text(item.implementation_hashes_digest, "execution.implementation_hashes_digest"),
    mandateId: text(item.mandate_id, "execution.mandate_id"),
    semanticInput: text(item.semantic_input, "execution.semantic_input"),
    state: text(item.state, "execution.state"),
    targetCodeHashesDigest: text(item.target_code_hashes_digest, "execution.target_code_hashes_digest"),
    targetsDigest: text(item.targets_digest, "execution.targets_digest"),
    valuesDigest: text(item.values_digest, "execution.values_digest"),
  };
}

function parseEvidence(value: unknown): CanonicalEvidence {
  const item = record(value, "evidence");
  return {
    authenticatedAt: integer(item.authenticated_at, "evidence.authenticated_at"),
    authorityDigest: text(item.authority_digest, "evidence.authority_digest"),
    contentSha256: text(item.content_sha256, "evidence.content_sha256"),
    evidenceHash: text(item.evidence_hash, "evidence.evidence_hash"),
    exactByteLength: integer(item.exact_byte_length, "evidence.exact_byte_length"),
    executionId: text(item.execution_id, "evidence.execution_id"),
    schemaVersion: text(item.schema_version, "evidence.schema_version"),
    sourceDigest: text(item.source_digest, "evidence.source_digest"),
  };
}

function parseAdjudication(value: unknown): CanonicalAdjudication {
  const item = record(value, "adjudication");
  return {
    adjudicationId: text(item.adjudication_id, "adjudication.adjudication_id"),
    administrativeAuthorityChanged: boolean(item.administrative_authority_changed, "adjudication.administrative_authority_changed"),
    createdAt: integer(item.created_at, "adjudication.created_at"),
    economicTermsConsistent: boolean(item.economic_terms_consistent, "adjudication.economic_terms_consistent"),
    evidenceHash: text(item.evidence_hash, "adjudication.evidence_hash"),
    evidenceSufficient: boolean(item.evidence_sufficient, "adjudication.evidence_sufficient"),
    executionId: text(item.execution_id, "adjudication.execution_id"),
    generation: integer(item.generation, "adjudication.generation"),
    implementationBehaviorConsistent: boolean(item.implementation_behavior_consistent, "adjudication.implementation_behavior_consistent"),
    intentSatisfied: boolean(item.intent_satisfied, "adjudication.intent_satisfied"),
    mandateId: text(item.mandate_id, "adjudication.mandate_id"),
    prohibitedEffectPresent: boolean(item.prohibited_effect_present, "adjudication.prohibited_effect_present"),
    scopeExpanded: boolean(item.scope_expanded, "adjudication.scope_expanded"),
    semanticSchema: text(item.semantic_schema, "adjudication.semantic_schema"),
    verdict: text(item.verdict, "adjudication.verdict"),
  };
}

function parsePermit(value: unknown): CanonicalPermit {
  const item = record(value, "permit");
  return {
    adjudicationGeneration: integer(item.adjudication_generation, "permit.adjudication_generation"),
    adjudicationId: text(item.adjudication_id, "permit.adjudication_id"),
    calldataDigest: text(item.calldata_digest, "permit.calldata_digest"),
    chainId: integer(item.chain_id, "permit.chain_id"),
    executionBundleHash: text(item.execution_bundle_hash, "permit.execution_bundle_hash"),
    executionId: text(item.execution_id, "permit.execution_id"),
    expiresAt: integer(item.expires_at, "permit.expires_at"),
    implementationHashesDigest: text(item.implementation_hashes_digest, "permit.implementation_hashes_digest"),
    issuedAt: integer(item.issued_at, "permit.issued_at"),
    mandateId: text(item.mandate_id, "permit.mandate_id"),
    mandateVersion: integer(item.mandate_version, "permit.mandate_version"),
    permitBindingHash: text(item.permit_binding_hash, "permit.permit_binding_hash"),
    permitId: text(item.permit_id, "permit.permit_id"),
    proposalHash: text(item.proposal_hash, "permit.proposal_hash"),
    semanticSchema: text(item.semantic_schema, "permit.semantic_schema"),
    status: text(item.status, "permit.status"),
    targetCodeHashesDigest: text(item.target_code_hashes_digest, "permit.target_code_hashes_digest"),
    targetsDigest: text(item.targets_digest, "permit.targets_digest"),
    valuesDigest: text(item.values_digest, "permit.values_digest"),
  };
}

export function canonicalConfigFromEnv(env: Record<string, string | undefined>): CanonicalContractConfig {
  const contractAddress = env.FIREWALL_CONTRACT_ADDRESS;
  const chainId = env.FIREWALL_CHAIN_ID;
  const rpcUrl = env.FIREWALL_RPC_URL;
  if (!contractAddress || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) throw new Error("CANONICAL_CONFIG_INVALID:FIREWALL_CONTRACT_ADDRESS");
  if (!chainId || !/^\d+$/.test(chainId)) throw new Error("CANONICAL_CONFIG_INVALID:FIREWALL_CHAIN_ID");
  if (!rpcUrl || !/^https:\/\//.test(rpcUrl)) throw new Error("CANONICAL_CONFIG_INVALID:FIREWALL_RPC_URL");
  const parsedChainId = Number(chainId);
  if (parsedChainId !== CANONICAL_CHAIN_ID) throw new Error("CANONICAL_CONFIG_UNSUPPORTED_CHAIN");
  if (contractAddress.toLowerCase() !== CANONICAL_CONTRACT_ADDRESS.toLowerCase()) throw new Error("CANONICAL_CONFIG_UNSUPPORTED_CONTRACT");
  if (rpcUrl !== CANONICAL_RPC_URL) throw new Error("CANONICAL_CONFIG_UNSUPPORTED_RPC");
  return { contractAddress: contractAddress as `0x${string}`, chainId: parsedChainId, rpcUrl };
}

export class GenLayerCanonicalReader {
  constructor(private readonly config: CanonicalContractConfig, private readonly call: CanonicalContractCall) {}

  async read(now = Math.floor(Date.now() / 1000)): Promise<CanonicalLiveReadModel> {
    const read = (functionName: string, args: readonly unknown[] = []) => this.call({ address: this.config.contractAddress, functionName, args });
    const [semanticSchema, semanticKeys, mandates, executions, evidence, adjudications, permits] = await Promise.all([
      read("get_semantic_schema"),
      read("get_semantic_keys"),
      read("get_mandates"),
      read("get_executions"),
      read("get_evidence"),
      read("get_adjudications"),
      read("get_permits"),
    ]);
    const parsedPermits = list(permits, "permits").map(parsePermit);
    const statusEntries = await Promise.all(parsedPermits.map(async (permit) => [permit.permitId, text(await read("get_permit_status", [permit.permitId, now]), `permit_status.${permit.permitId}`)] as const));
    return {
      status: "READY",
      config: this.config,
      asOf: new Date().toISOString(),
      semanticSchema: text(semanticSchema, "semantic_schema"),
      semanticKeys: list(semanticKeys, "semantic_keys").map((key) => text(key, "semantic_key")),
      mandates: list(mandates, "mandates").map(parseMandate),
      executions: list(executions, "executions").map(parseExecution),
      evidence: list(evidence, "evidence").map(parseEvidence),
      adjudications: list(adjudications, "adjudications").map(parseAdjudication),
      permits: parsedPermits,
      permitStatuses: Object.fromEntries(statusEntries),
    };
  }
}

export function createCanonicalReader(config: CanonicalContractConfig): GenLayerCanonicalReader {
  const client = createClient({
    chain: { id: config.chainId, name: studioDevnet.name, nativeCurrency: studioDevnet.nativeCurrency, rpcUrls: { default: { http: [config.rpcUrl] as readonly string[] } } },
    endpoint: config.rpcUrl,
  });
  return new GenLayerCanonicalReader(config, (input) => client.readContract({ address: input.address, functionName: input.functionName, args: input.args as never[] }));
}

export function createCanonicalReaderFromEnv(env: Record<string, string | undefined> = process.env): GenLayerCanonicalReader {
  return createCanonicalReader(canonicalConfigFromEnv(env));
}
