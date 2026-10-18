import { createClient } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";
import { studionet } from "genlayer-js/chains";
import { keccak256, stringToHex, type Address, type Hex } from "viem";

export type ProspectiveMandate = {
  mandateId: string; creator: Address; proposalExternalId: string; proposalText: string;
  proposalHash: Hex; state: string; frozenAt: number;
};
export type ProspectiveIntent = {
  intentId: Hex; mandateId: string; creator: Address; chainId: number; safe: Address;
  safeNonce: number; target: Address; value: string; calldata: Hex; calldataHash: Hex;
  operation: number; guard: Address; guardCodeHash: Hex; targetCodeHash: Hex;
  safeDeploymentTx: Hex; evidenceBlock: number; executionDeadline: number; permitExpiry: number;
  intentHash: Hex; state: string; authenticatedEvidence: string; evidenceHash: Hex; adjudicationId: string;
};
export type ProspectiveAdjudication = {
  adjudicationId: string; intentId: string; generation: number; intentSatisfied: boolean;
  scopeExpanded: boolean; prohibitedEffectPresent: boolean; economicTermsConsistent: boolean;
  administrativeAuthorityChanged: boolean; implementationBehaviorConsistent: boolean;
  evidenceSufficient: boolean; verdict: string;
};
export type ProspectivePermit = {
  permitId: string; intentId: string; mandateId: string; adjudicationId: string;
  generation: number; issuedAt: number; executionDeadline: number; expiresAt: number;
  intentHash: Hex; evidenceHash: Hex; bindingHash: Hex; status: string;
};
export type ProspectiveCanonicalModel = {
  status: "READY"; source: "LIVE_CANONICAL"; config: {
    contractAddress: Address; chainId: 61999; rpcUrl: "https://studio.genlayer.com/api";
    networkAlias: "studionet"; expectedSourceSha256: string;
  }; asOf: string; schema: "FIREWALL_PROSPECTIVE_INTENT_V3";
  mandates: readonly ProspectiveMandate[]; intents: readonly ProspectiveIntent[];
  adjudications: readonly ProspectiveAdjudication[]; permits: readonly ProspectivePermit[];
  permitStatuses: Readonly<Record<string, string>>;
};

const CHAIN = studionet as unknown as Exclude<NonNullable<Parameters<typeof createClient>[0]>["chain"], undefined>;
const RPC = "https://studio.genlayer.com/api" as const;
const EXPECTED_METHODS = [
  "adjudicate_prospective_intent", "authenticate_prospective_intent", "commit_prospective_intent",
  "create_mandate", "freeze_mandate", "get_adjudications", "get_intents", "get_mandates",
  "get_permit_status", "get_permits", "get_schema", "issue_prospective_permit",
].sort();

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`PROSPECTIVE_READ_INVALID:${label}`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`PROSPECTIVE_READ_INVALID:${label}`);
  return value;
}
function int(value: unknown, label: string): number {
  const n = typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`PROSPECTIVE_READ_INVALID:${label}`);
  return n;
}
function uintString(value: unknown, label: string): string {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new Error(`PROSPECTIVE_READ_INVALID:${label}`);
}
function hash(value: unknown, label: string): Hex {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase() as Hex;
  if (value instanceof Uint8Array && value.length === 32) return (`0x${Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("")}`) as Hex;
  throw new Error(`PROSPECTIVE_READ_INVALID:${label}`);
}
function address(value: unknown, label: string): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`PROSPECTIVE_READ_INVALID:${label}`);
  return value as Address;
}
function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`PROSPECTIVE_READ_INVALID:${label}`);
  return value;
}
function parseMandate(value: unknown): ProspectiveMandate {
  const item = object(value, "mandate");
  return { mandateId: string(item.mandate_id, "mandate_id"), creator: address(item.creator, "creator"), proposalExternalId: string(item.proposal_external_id, "proposal_external_id"), proposalText: string(item.proposal_text, "proposal_text"), proposalHash: hash(item.proposal_hash, "proposal_hash"), state: string(item.state, "state"), frozenAt: int(item.frozen_at, "frozen_at") };
}
export function parseProspectiveIntent(value: unknown): ProspectiveIntent {
  const item = object(value, "intent");
  const evidenceHash = item.evidence_hash;
  return {
    intentId: hash(item.intent_id, "intent_id"), mandateId: string(item.mandate_id, "mandate_id"), creator: address(item.creator, "creator"),
    chainId: int(item.chain_id, "chain_id"), safe: address(item.safe, "safe"), safeNonce: int(item.safe_nonce, "safe_nonce"),
    target: address(item.target, "target"), value: uintString(item.value, "value"),
    calldata: string(item.calldata, "calldata") as Hex, calldataHash: hash(item.calldata_hash, "calldata_hash"), operation: int(item.operation, "operation"),
    guard: address(item.guard, "guard"), guardCodeHash: hash(item.guard_code_hash, "guard_code_hash"), targetCodeHash: hash(item.target_code_hash, "target_code_hash"),
    safeDeploymentTx: hash(item.safe_deployment_tx, "safe_deployment_tx"), evidenceBlock: int(item.evidence_block, "evidence_block"),
    executionDeadline: int(item.execution_deadline, "execution_deadline"), permitExpiry: int(item.permit_expiry, "permit_expiry"),
    intentHash: hash(item.intent_hash, "intent_hash"), state: string(item.state, "state"), authenticatedEvidence: string(item.authenticated_evidence, "authenticated_evidence"),
    evidenceHash: (evidenceHash instanceof Uint8Array && evidenceHash.length === 0) || evidenceHash === "0x" || evidenceHash === "" ? `0x${"00".repeat(32)}` as Hex : hash(evidenceHash, "evidence_hash"), adjudicationId: string(item.adjudication_id, "adjudication_id"),
  };
}
function parseAdjudication(value: unknown): ProspectiveAdjudication {
  const item = object(value, "adjudication");
  const bool = (key: string) => { if (typeof item[key] !== "boolean") throw new Error(`PROSPECTIVE_READ_INVALID:${key}`); return item[key] as boolean; };
  return { adjudicationId: string(item.adjudication_id, "adjudication_id"), intentId: string(item.intent_id, "intent_id"), generation: int(item.generation, "generation"), intentSatisfied: bool("intent_satisfied"), scopeExpanded: bool("scope_expanded"), prohibitedEffectPresent: bool("prohibited_effect_present"), economicTermsConsistent: bool("economic_terms_consistent"), administrativeAuthorityChanged: bool("administrative_authority_changed"), implementationBehaviorConsistent: bool("implementation_behavior_consistent"), evidenceSufficient: bool("evidence_sufficient"), verdict: string(item.verdict, "verdict") };
}
function parsePermit(value: unknown): ProspectivePermit {
  const item = object(value, "permit");
  return { permitId: string(item.permit_id, "permit_id"), intentId: string(item.intent_id, "intent_id"), mandateId: string(item.mandate_id, "mandate_id"), adjudicationId: string(item.adjudication_id, "adjudication_id"), generation: int(item.generation, "generation"), issuedAt: int(item.issued_at, "issued_at"), executionDeadline: int(item.execution_deadline, "execution_deadline"), expiresAt: int(item.expires_at, "expires_at"), intentHash: hash(item.intent_hash, "intent_hash"), evidenceHash: hash(item.evidence_hash, "evidence_hash"), bindingHash: hash(item.binding_hash, "binding_hash"), status: string(item.status, "status") };
}

export function createProspectiveReader(config: { contractAddress: Address; chainId: number; rpcUrl: string; expectedSourceSha256: string }) {
  if (config.chainId !== 61999 || config.rpcUrl !== RPC || !/^0x[0-9a-fA-F]{40}$/.test(config.contractAddress) || !/^[0-9a-f]{64}$/.test(config.expectedSourceSha256)) throw new Error("PROSPECTIVE_CONFIG_UNSUPPORTED");
  const client = createClient({ chain: CHAIN, endpoint: RPC });
  const read = (functionName: string, args: readonly unknown[] = []) => client.readContract({ address: config.contractAddress, functionName, args: args as never[], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  return {
    async read(): Promise<ProspectiveCanonicalModel> {
      if (await client.getChainId() !== 61999) throw new Error("PROSPECTIVE_CHAIN_MISMATCH");
      const source = await client.getContractCode(config.contractAddress);
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      const sourceHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (sourceHash !== config.expectedSourceSha256.toLowerCase()) throw new Error("PROSPECTIVE_SOURCE_HASH_MISMATCH");
      const schema = await client.getContractSchema(config.contractAddress);
      const methods = Object.keys(schema.methods).sort();
      if (JSON.stringify(methods) !== JSON.stringify(EXPECTED_METHODS) || schema.ctor.params.length !== 0) throw new Error("PROSPECTIVE_ABI_SCHEMA_MISMATCH");
      const declaredSchema = await read("get_schema");
      if (declaredSchema !== "FIREWALL_PROSPECTIVE_INTENT_V3") throw new Error("PROSPECTIVE_SCHEMA_MISMATCH");
      const rawMandates = await read("get_mandates");
      const rawIntents = await read("get_intents");
      const rawAdjudications = await read("get_adjudications");
      const rawPermits = await read("get_permits");
      const mandates = array(rawMandates, "mandates").map(parseMandate);
      const intents = array(rawIntents, "intents").map(parseProspectiveIntent);
      const adjudications = array(rawAdjudications, "adjudications").map(parseAdjudication);
      const permits = array(rawPermits, "permits").map(parsePermit);
      const permitStatuses: Record<string, string> = {};
      for (const permit of permits) permitStatuses[permit.permitId] = string(await read("get_permit_status", [permit.permitId]), `permit_status.${permit.permitId}`);
      return {
        status: "READY", source: "LIVE_CANONICAL",
        config: { contractAddress: config.contractAddress, chainId: 61999, rpcUrl: RPC, networkAlias: "studionet", expectedSourceSha256: sourceHash },
        asOf: new Date().toISOString(), schema: "FIREWALL_PROSPECTIVE_INTENT_V3", mandates, intents, adjudications, permits, permitStatuses,
      };
    },
  };
}

export function prospectiveCanonicalBindingHash(intentId: Hex, intentHash: Hex, evidenceHash: Hex, mandateId: string, proposalHash: Hex, adjudicationId: string, generation: number, chainId: number, safe: Address, safeNonce: number, target: Address, value: string, calldataHash: Hex, operation: number, guard: Address, guardCodeHash: Hex, executionDeadline: number, permitExpiry: number): Hex {
  const material = ["FIREWALL_PROSPECTIVE_PERMIT_V3", mandateId, proposalHash.slice(2), intentId, intentHash, evidenceHash, adjudicationId, String(generation), String(chainId), safe.toLowerCase(), String(safeNonce), target.toLowerCase(), value, calldataHash, String(operation), guard.toLowerCase(), guardCodeHash, String(executionDeadline), String(permitExpiry)].join("|");
  return keccak256(stringToHex(material));
}
