import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { resolveFirewallNetworkForEndpoint } from "@firewall/genlayer-client/network-config";
import { safeGuardTypedData, type SafePermitAuthorization } from "./index.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const AUTH_FACT_KEYS = [
  "schema", "chain_id", "governance_contract", "transaction_hash", "block_number", "block_hash", "parent_block_hash",
  "finality", "receipt_status", "execution_outcome", "transaction_to", "transaction_value", "transaction_calldata",
  "targets", "values", "calldatas", "operations", "safe_implementation_address", "safe_execution_mode", "code_hashes", "implementation_hashes",
] as const;

type CanonicalLiveReadModel = {
  readonly status: "READY";
  readonly source: "LIVE_CANONICAL" | "TEST_FIXTURE";
  readonly config: { readonly contractAddress: Address; readonly chainId: number; readonly rpcUrl: string; readonly networkAlias?: "testnet-bradbury" | "studionet" };
  readonly asOf: string;
  readonly evidenceSchema: string;
  readonly semanticSchema: string;
  readonly semanticKeys: readonly string[];
  readonly mandates: readonly { readonly creator: string; readonly governanceChainId: number; readonly governanceContract: string; readonly proposalExternalId: string; readonly proposalHash: string; readonly proposalSource: string; readonly proposalText: string; readonly proposalTextSha256: string; readonly proposalTextBytes: number; readonly mandateId: string; readonly mandateVersion: number; readonly mandateDigest: string; readonly state: string; readonly frozenAt: number }[];
  readonly executions: readonly { readonly executionId: string; readonly mandateId: string; readonly chainId: number; readonly expectedFacts: string; readonly sourceA: string; readonly sourceB: string; readonly state: string; readonly evidenceJson: string; readonly evidenceStatus: string; readonly generation: number }[];
  readonly evidence: readonly { readonly executionId: string; readonly evidenceStatus: string; readonly factsJson: string }[];
  readonly adjudications: readonly { readonly adjudicationId: string; readonly executionId: string; readonly generation: number; readonly intentSatisfied: boolean; readonly scopeExpanded: boolean; readonly prohibitedEffectPresent: boolean; readonly economicTermsConsistent: boolean; readonly administrativeAuthorityChanged: boolean; readonly implementationBehaviorConsistent: boolean; readonly evidenceSufficient: boolean; readonly verdict: string }[];
  readonly permits: readonly { readonly permitId: string; readonly mandateId: string; readonly mandateVersion: number; readonly proposalHash: string; readonly executionId: string; readonly adjudicationId: string; readonly generation: number; readonly issuedAt: number; readonly expiresAt: number; readonly bindingHash: string; readonly status: string }[];
  readonly permitStatuses: Readonly<Record<string, string>>;
};

export type CanonicalRelayCall = {
  readonly permitId: string;
  readonly targetChainId: bigint;
  readonly safe: Address;
  readonly guard: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly operation: 0 | 1;
  readonly safeNonce: bigint;
  readonly targetCodeHash: Hex;
  readonly executionDeadline?: bigint;
  readonly expiresAt: bigint;
  readonly nowSeconds: bigint;
};

export type CanonicalRelayAuthorization = {
  readonly authorization: SafePermitAuthorization;
  readonly typedData: ReturnType<typeof safeGuardTypedData>;
  readonly canonicalPermitHash: Hex;
};

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`CANONICAL_PERMIT_INVALID:${name}`);
  return value as Record<string, unknown>;
}

function bytes32(value: unknown, name: string): Hex {
  if (typeof value !== "string") throw new Error(`CANONICAL_PERMIT_INVALID:${name}`);
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) throw new Error(`CANONICAL_PERMIT_INVALID:${name}`);
  return normalized.toLowerCase() as Hex;
}

function hashText(value: string): Hex {
  return keccak256(stringToHex(value));
}

function jsonText(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`CANONICAL_PERMIT_INVALID:${name}`);
  return value;
}

function sameAddress(a: unknown, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

function canonicalPermitBindingHash(permit: CanonicalLiveReadModel["permits"][number], mandate: CanonicalLiveReadModel["mandates"][number], execution: CanonicalLiveReadModel["executions"][number], adjudication: CanonicalLiveReadModel["adjudications"][number]): Hex {
  const proposalHashHex = bytes32(mandate.proposalHash, "proposal_hash").slice(2);
  const material = [
    "FIREWALL_PERMIT_BINDING_V2", mandate.mandateId, String(mandate.mandateVersion), proposalHashHex,
    execution.executionId, adjudication.adjudicationId, String(execution.generation), execution.expectedFacts, execution.evidenceJson,
  ].join("|");
  return hashText(material);
}

/**
 * Verifies a finalized canonical GenLayer permit against its committed mandate,
 * execution facts, authenticated evidence and verdict, then builds an
 * execution-specific Safe EIP-712 attestation. The caller remains responsible
 * for live EVM configuration, module-path and code identity checks.
 */
export function buildCanonicalRelayAuthorization(model: CanonicalLiveReadModel, call: CanonicalRelayCall): CanonicalRelayAuthorization {
  if (model.status !== "READY" || model.source !== "LIVE_CANONICAL") throw new Error("LIVE_CANONICAL_STATE_REQUIRED");
  let selectedNetwork: ReturnType<typeof resolveFirewallNetworkForEndpoint>;
  try {
    selectedNetwork = resolveFirewallNetworkForEndpoint(model.config.chainId, model.config.rpcUrl);
  } catch {
    throw new Error("LIVE_CANONICAL_STATE_REQUIRED");
  }
  if (model.config.networkAlias && model.config.networkAlias !== selectedNetwork.alias) throw new Error("LIVE_CANONICAL_STATE_REQUIRED");
  const permit = model.permits.find((item) => item.permitId === call.permitId);
  if (!permit || permit.status !== "ACTIVE" || model.permitStatuses[call.permitId] !== "ACTIVE") throw new Error("CANONICAL_PERMIT_NOT_ACTIVE");
  const mandate = model.mandates.find((item) => item.mandateId === permit.mandateId);
  const execution = model.executions.find((item) => item.executionId === permit.executionId);
  const adjudication = model.adjudications.find((item) => item.adjudicationId === permit.adjudicationId);
  if (!mandate || !execution || !adjudication) throw new Error("CANONICAL_PERMIT_REFERENCES_MISSING");
  if (mandate.state !== "MANDATE_FROZEN" || execution.state !== "ADJUDICATED" || execution.evidenceStatus !== "VERIFIED_POST_EXECUTION" || execution.generation !== permit.generation || adjudication.executionId !== execution.executionId || adjudication.generation !== permit.generation || adjudication.verdict !== "EXECUTION_PERMITTED") throw new Error("CANONICAL_PERMIT_ADJUDICATION_INVALID");
  if (permit.mandateVersion !== mandate.mandateVersion || bytes32(permit.proposalHash, "permit.proposal_hash") !== bytes32(mandate.proposalHash, "mandate.proposal_hash")) throw new Error("CANONICAL_PERMIT_MANDATE_BINDING_MISMATCH");
  if (canonicalPermitBindingHash(permit, mandate, execution, adjudication) !== bytes32(permit.bindingHash, "binding_hash")) throw new Error("CANONICAL_PERMIT_BINDING_HASH_MISMATCH");

  let expectedFacts: Record<string, unknown>;
  let evidenceFacts: Record<string, unknown>;
  try {
    expectedFacts = record(JSON.parse(jsonText(execution.expectedFacts, "expected_facts")), "expected_facts");
    evidenceFacts = record(JSON.parse(jsonText(execution.evidenceJson, "evidence_json")), "evidence_json");
  } catch {
    throw new Error("CANONICAL_PERMIT_FACTS_MALFORMED");
  }
  if (expectedFacts.mandate_id !== mandate.mandateId || expectedFacts.schema !== "FIREWALL_EVM_EVIDENCE_V3" || evidenceFacts.schema !== "FIREWALL_EVM_EVIDENCE_V3") throw new Error("CANONICAL_PERMIT_FACTS_SCHEMA_MISMATCH");
  for (const key of AUTH_FACT_KEYS) {
    if (JSON.stringify(expectedFacts[key]) !== JSON.stringify(evidenceFacts[key])) throw new Error(`CANONICAL_PERMIT_AUTHENTICATED_FACT_MISMATCH:${key}`);
  }
  if (evidenceFacts.finality !== "HISTORICAL" || evidenceFacts.receipt_status !== "SUCCESS" || evidenceFacts.execution_outcome !== "SAFE_EXECUTION_SUCCESS" || evidenceFacts.safe_execution_mode !== "SAFE_DIRECT_CALL_ONLY") throw new Error("CANONICAL_PERMIT_EXECUTION_NOT_AUTHENTICATED");
  if (BigInt(String(evidenceFacts.chain_id)) !== call.targetChainId || !sameAddress(evidenceFacts.governance_contract, call.safe)) throw new Error("SAFE_CHAIN_NOT_BOUND_TO_CANONICAL_PERMIT");
  if (call.operation !== 0 || !Array.isArray(evidenceFacts.operations) || evidenceFacts.operations.length !== 1 || Number(evidenceFacts.operations[0]) !== call.operation) throw new Error("UNSUPPORTED_SAFE_EXECUTION_MODE");
  if (!Array.isArray(evidenceFacts.targets) || evidenceFacts.targets.length !== 1 || !sameAddress(evidenceFacts.targets[0], call.to)) throw new Error("SAFE_TARGET_NOT_BOUND_TO_CANONICAL_PERMIT");
  if (!Array.isArray(evidenceFacts.values) || evidenceFacts.values.length !== 1 || BigInt(String(evidenceFacts.values[0])) !== call.value) throw new Error("SAFE_VALUE_NOT_BOUND_TO_CANONICAL_PERMIT");
  if (!Array.isArray(evidenceFacts.calldatas) || evidenceFacts.calldatas.length !== 1 || String(evidenceFacts.calldatas[0]).toLowerCase() !== call.data.toLowerCase()) throw new Error("SAFE_CALLDATA_NOT_BOUND_TO_CANONICAL_PERMIT");
  if (Array.isArray(evidenceFacts.code_hashes) && evidenceFacts.code_hashes.length !== 0) throw new Error("UNSUPPORTED_TARGET_CODE_IDENTITY");
  if (Array.isArray(evidenceFacts.implementation_hashes) && evidenceFacts.implementation_hashes.length !== 0) throw new Error("UNSUPPORTED_TARGET_IMPLEMENTATION_IDENTITY");
  const executionDeadline = call.executionDeadline ?? call.expiresAt;
  if (call.nowSeconds >= BigInt(permit.expiresAt) || executionDeadline <= call.nowSeconds || call.expiresAt <= call.nowSeconds || executionDeadline > call.expiresAt || call.expiresAt > BigInt(permit.expiresAt)) throw new Error("CANONICAL_PERMIT_EXPIRED_OR_ATTESTATION_OUTLIVES_PERMIT");

  const proposalHash = bytes32(mandate.proposalHash, "proposal_hash");
  const permitIdHash = hashText(permit.permitId);
  const intentIdHash = hashText(["FIREWALL_HISTORICAL_INTENT_V1", permit.permitId, execution.executionId].join("|"));
  const mandateIdHash = hashText(mandate.mandateId);
  const executionIdHash = hashText(execution.executionId);
  const adjudicationIdHash = hashText(adjudication.adjudicationId);
  const bundleHash = hashText(execution.expectedFacts);
  const factsDigest = hashText(JSON.stringify({ code_hashes: evidenceFacts.code_hashes, target_code_hash: call.targetCodeHash }));
  const implementationFactsDigest = hashText(JSON.stringify({ implementation_hashes: evidenceFacts.implementation_hashes, safe_implementation_address: evidenceFacts.safe_implementation_address }));
  const targetsDigest = hashText(JSON.stringify(evidenceFacts.targets));
  const valuesDigest = hashText(JSON.stringify(evidenceFacts.values));
  const calldataDigest = hashText(JSON.stringify(evidenceFacts.calldatas));
  const batchStructureHash = hashText(JSON.stringify({ targets: evidenceFacts.targets, values: evidenceFacts.values, calldatas: evidenceFacts.calldatas, operations: evidenceFacts.operations }));
  const canonicalPermitHash = hashText([
    "FIREWALL_CANONICAL_PERMIT_V1", model.config.contractAddress.toLowerCase(), String(model.config.chainId), permitIdHash,
    mandateIdHash, executionIdHash, adjudicationIdHash, String(adjudication.generation), proposalHash,
    permit.bindingHash.toLowerCase(), String(permit.expiresAt), adjudication.verdict, bundleHash,
  ].join("|"));
  const authorization: SafePermitAuthorization = {
    permitId: permitIdHash,
    intentId: intentIdHash,
    mandateId: mandateIdHash,
    executionId: executionIdHash,
    proposalHash,
    executionBundleHash: bundleHash,
    targetChainId: call.targetChainId,
    safe: call.safe,
    to: call.to,
    value: call.value,
    dataHash: keccak256(call.data),
    operation: call.operation,
    safeNonce: call.safeNonce,
    targetsDigest,
    valuesDigest,
    calldataDigest,
    codeFactsDigest: factsDigest,
    implementationFactsDigest,
    targetCodeHash: call.targetCodeHash,
    implementationAddress: ZERO_ADDRESS,
    implementationCodeHash: `0x${"00".repeat(32)}`,
    batchStructureHash,
    adjudicationId: adjudicationIdHash,
    adjudicationGeneration: BigInt(adjudication.generation),
    executionDeadline,
    expiresAt: call.expiresAt,
    canonicalPermitHash,
  };
  return { authorization, typedData: safeGuardTypedData(call.targetChainId, call.guard, authorization), canonicalPermitHash };
}
