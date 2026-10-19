import { keccak256, stringToHex, type Address, type Hex } from "viem";
import type { ProspectiveCanonicalModel } from "@firewall/genlayer-client/prospective-reader";
import { safeGuardTypedData, type SafePermitAuthorization } from "./index.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111n;
const SAFE_SINGLETON = "0x41675c099f32341bf84bfc5382af534df5c7461a";
const SAFE_SINGLETON_CODE_HASH = "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4";
const SAFE_FACTORY = "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67";
const SAFE_FACTORY_CODE_HASH = "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317";

export type ProspectiveRelayCall = {
  readonly permitId: string;
  readonly guard: Address;
  readonly targetChainId: bigint;
  readonly safe: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly operation: 0 | 1;
  readonly safeNonce: bigint;
  readonly nowSeconds: bigint;
  readonly attestationExpiry: bigint;
};

export type ProspectiveRelayAuthorization = {
  readonly authorization: SafePermitAuthorization;
  readonly typedData: ReturnType<typeof safeGuardTypedData>;
  readonly canonicalPermitHash: Hex;
};

function fail(reason: string): never { throw new Error(reason); }
function hashText(value: string): Hex { return keccak256(stringToHex(value)); }
function bytes32(value: string, label: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) return fail(`PROSPECTIVE_CANONICAL_INVALID:${label}`);
  return normalized.toLowerCase() as Hex;
}
function stable(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  return fail("PROSPECTIVE_CANONICAL_INVALID:non_json_value");
}
function objectText(value: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail(`PROSPECTIVE_CANONICAL_INVALID:${label}`);
    return parsed as Record<string, unknown>;
  } catch { return fail(`PROSPECTIVE_CANONICAL_INVALID:${label}`); }
}
function sameAddress(left: unknown, right: string): boolean { return typeof left === "string" && left.toLowerCase() === right.toLowerCase(); }
function sameStable(left: unknown, right: unknown): boolean { return stable(left) === stable(right); }

function expectedIntentJson(model: ProspectiveCanonicalModel, intent: ProspectiveCanonicalModel["intents"][number]): string {
  return stable({
    schema: model.schema,
    intent_id: intent.intentId.toLowerCase(),
    mandate_id: intent.mandateId,
    owner: intent.creator.toLowerCase(),
    chain_id: intent.chainId,
    safe: intent.safe.toLowerCase(),
    safe_nonce: intent.safeNonce,
    target: intent.target.toLowerCase(),
    value: intent.value,
    calldata: intent.calldata.toLowerCase(),
    calldata_hash: intent.calldataHash.toLowerCase(),
    operation: intent.operation,
    guard: intent.guard.toLowerCase(),
    guard_code_hash: intent.guardCodeHash.toLowerCase(),
    target_code_hash: intent.targetCodeHash.toLowerCase(),
    safe_deployment_tx: intent.safeDeploymentTx.toLowerCase(),
    evidence_block: intent.evidenceBlock,
    execution_deadline: intent.executionDeadline,
    permit_expiry: intent.permitExpiry,
  });
}

function authenticatedIntentJson(intent: ProspectiveCanonicalModel["intents"][number]): string {
  return stable({
    intent_id: intent.intentId.toLowerCase(), owner: intent.creator.toLowerCase(), chain_id: intent.chainId,
    safe: intent.safe.toLowerCase(), safe_nonce: intent.safeNonce, target: intent.target.toLowerCase(),
    value: intent.value, calldata: intent.calldata.toLowerCase(), calldata_hash: intent.calldataHash.toLowerCase(),
    operation: intent.operation, guard: intent.guard.toLowerCase(), guard_code_hash: intent.guardCodeHash.toLowerCase(),
    target_code_hash: intent.targetCodeHash.toLowerCase(), safe_deployment_tx: intent.safeDeploymentTx.toLowerCase(),
    evidence_block: intent.evidenceBlock, execution_deadline: intent.executionDeadline, permit_expiry: intent.permitExpiry,
  });
}

function verifyProviderPair(model: ProspectiveCanonicalModel, intent: ProspectiveCanonicalModel["intents"][number]): Record<string, unknown> {
  if (intent.state !== "PROSPECTIVE_PERMIT_ISSUED" || intent.evidenceHash === `0x${"00".repeat(32)}`) return fail("PROSPECTIVE_EVIDENCE_NOT_AUTHENTICATED");
  const evidence = objectText(intent.authenticatedEvidence, "evidence_json");
  if (evidence.schema !== "FIREWALL_PROSPECTIVE_EVIDENCE_V2" || evidence.evidence_class !== "PRE_EXECUTION_CHAIN_STATE") return fail("PROSPECTIVE_EVIDENCE_SCHEMA_MISMATCH");
  if (!sameStable(evidence.intent, JSON.parse(authenticatedIntentJson(intent)))) return fail("PROSPECTIVE_EVIDENCE_INTENT_MISMATCH");
  const pair = evidence.independently_authenticated as Record<string, unknown> | undefined;
  if (!pair || pair.provider_state_agreement !== true || pair.receipt_claimed_for_future_execution !== false) return fail("PROSPECTIVE_PROVIDER_AGREEMENT_MISSING");
  const a = pair.provider_a as Record<string, unknown> | undefined;
  const b = pair.provider_b as Record<string, unknown> | undefined;
  if (!a || !b || a.provider !== "DRPC_SEPOLIA" || b.provider !== "PUBLICNODE_SEPOLIA_BLOCKSCOUT" || pair.provider_b_receipt_source !== "BLOCKSCOUT_SEPOLIA_REST") return fail("PROSPECTIVE_PROVIDER_IDENTITY_MISMATCH");
  const stableA = { ...a }; const stableB = { ...b };
  delete stableA.provider; delete stableB.provider;
  if (!sameStable(stableA, stableB)) return fail("PROSPECTIVE_PROVIDER_FACTS_DISAGREE");
  if (Number(a.chain_id) !== 11155111 || !sameAddress((a.safe_state as Record<string, unknown> | undefined)?.address, intent.safe)) return fail("PROSPECTIVE_CHAIN_OR_SAFE_MISMATCH");
  const snapshot = a.snapshot as Record<string, unknown> | undefined;
  const safeState = a.safe_state as Record<string, unknown> | undefined;
  const targetState = a.target_state as Record<string, unknown> | undefined;
  const deployment = a.safe_deployment as Record<string, unknown> | undefined;
  if (!snapshot || Number(snapshot.number) !== intent.evidenceBlock || !/^0x[0-9a-f]{64}$/.test(String(snapshot.hash))) return fail("PROSPECTIVE_SNAPSHOT_INVALID");
  const observedNonce = Number(safeState?.nonce);
  const guardInstalledAtSnapshot = sameAddress(safeState?.guard, intent.guard);
  const guardInstallPendingAtSnapshot = safeState?.guard_installation_pending === true
    && sameAddress(safeState?.guard, ZERO_ADDRESS)
    && sameAddress(safeState?.intended_guard, intent.guard)
    && Number(safeState?.planned_execution_nonce) === intent.safeNonce
    && observedNonce + 1 === intent.safeNonce;
  if (!safeState || safeState.threshold !== 1 || !Array.isArray(safeState.owners) || safeState.owners.length !== 1 || !sameAddress(safeState.owners[0], intent.creator) || (!guardInstalledAtSnapshot && !guardInstallPendingAtSnapshot) || (guardInstalledAtSnapshot && observedNonce !== intent.safeNonce) || !Array.isArray(safeState.enabled_modules) || safeState.enabled_modules.length !== 0 || !sameAddress(safeState.implementation, SAFE_SINGLETON) || bytes32(String(safeState.guard_code_hash), "guard_code_hash") !== intent.guardCodeHash.toLowerCase()) return fail("PROSPECTIVE_SAFE_STATE_INVALID");
  if (!targetState || !sameAddress(targetState.address, intent.target) || bytes32(String(targetState.code_hash), "target_code_hash") !== intent.targetCodeHash.toLowerCase() || String(targetState.value) !== intent.value || String(targetState.calldata_hash).toLowerCase() !== intent.calldataHash.toLowerCase() || Number(targetState.operation) !== intent.operation) return fail("PROSPECTIVE_TARGET_FACTS_INVALID");
  if (!deployment || deployment.transaction_hash !== intent.safeDeploymentTx.toLowerCase() || deployment.receipt_status !== "SUCCESS" || deployment.proxy_creation_event !== true || !sameAddress(deployment.factory, SAFE_FACTORY) || !sameAddress(deployment.singleton, SAFE_SINGLETON) || String(deployment.factory_code_hash).toLowerCase() !== SAFE_FACTORY_CODE_HASH || String(deployment.singleton_code_hash).toLowerCase() !== SAFE_SINGLETON_CODE_HASH || Number(deployment.block_number) > intent.evidenceBlock) return fail("PROSPECTIVE_SAFE_PROVENANCE_INVALID");
  return evidence;
}

/** Builds a narrowly scoped attestation only from a finalized V3 canonical permit. */
export function buildProspectiveRelayAuthorization(model: ProspectiveCanonicalModel, call: ProspectiveRelayCall): ProspectiveRelayAuthorization {
  if (model.status !== "READY" || model.source !== "LIVE_CANONICAL" || model.config.chainId !== 61999 || model.config.rpcUrl !== "https://studio.genlayer.com/api" || model.schema !== "FIREWALL_PROSPECTIVE_INTENT_V3") return fail("LIVE_PROSPECTIVE_CANONICAL_STATE_REQUIRED");
  const permit = model.permits.find((candidate) => candidate.permitId === call.permitId);
  if (!permit || permit.status !== "ACTIVE" || model.permitStatuses[call.permitId] !== "ACTIVE") return fail("PROSPECTIVE_CANONICAL_PERMIT_NOT_ACTIVE");
  const intent = model.intents.find((candidate) => candidate.intentId.toLowerCase() === permit.intentId.toLowerCase());
  const mandate = model.mandates.find((candidate) => candidate.mandateId === permit.mandateId);
  const adjudication = model.adjudications.find((candidate) => candidate.adjudicationId === permit.adjudicationId);
  if (!intent || !mandate || !adjudication) return fail("PROSPECTIVE_CANONICAL_REFERENCES_MISSING");
  if (mandate.state !== "MANDATE_FROZEN" || intent.mandateId !== mandate.mandateId || intent.adjudicationId !== adjudication.adjudicationId || adjudication.intentId.toLowerCase() !== intent.intentId.toLowerCase() || adjudication.generation !== 1 || adjudication.verdict !== "PROSPECTIVE_AUTHORIZED" || !adjudication.evidenceSufficient || !adjudication.intentSatisfied || adjudication.scopeExpanded || adjudication.prohibitedEffectPresent || !adjudication.economicTermsConsistent || adjudication.administrativeAuthorityChanged || !adjudication.implementationBehaviorConsistent || permit.generation !== 1 || permit.intentHash.toLowerCase() !== intent.intentHash.toLowerCase() || permit.evidenceHash.toLowerCase() !== intent.evidenceHash.toLowerCase()) return fail("PROSPECTIVE_CANONICAL_ADJUDICATION_INVALID");
  const evidence = verifyProviderPair(model, intent);
  const expectedHash = hashText(expectedIntentJson(model, intent));
  if (expectedHash.toLowerCase() !== intent.intentHash.toLowerCase()) return fail("PROSPECTIVE_INTENT_HASH_MISMATCH");
  // GenVM persists compact sorted JSON; the canonical hash must match its exact bytes.
  const exactEvidenceHash = hashText(intent.authenticatedEvidence);
  if (exactEvidenceHash.toLowerCase() !== intent.evidenceHash.toLowerCase()) return fail("PROSPECTIVE_EVIDENCE_HASH_MISMATCH");
  const bindingHash = hashText([
    // V3 derives the binding material from "0x" + proposal_hash.hex(). Keep
    // the prefix here; stripping it changes the permit binding and prevents a
    // valid canonical V3 permit from being attested.
    "FIREWALL_PROSPECTIVE_PERMIT_V3", mandate.mandateId, mandate.proposalHash.toLowerCase(),
    intent.intentId.toLowerCase(), intent.intentHash.toLowerCase(), intent.evidenceHash.toLowerCase(),
    adjudication.adjudicationId, String(permit.generation), String(intent.chainId), intent.safe.toLowerCase(),
    String(intent.safeNonce), intent.target.toLowerCase(), intent.value, intent.calldataHash.toLowerCase(),
    String(intent.operation), intent.guard.toLowerCase(), intent.guardCodeHash.toLowerCase(),
    String(intent.executionDeadline), String(intent.permitExpiry),
  ].join("|"));
  if (bindingHash.toLowerCase() !== permit.bindingHash.toLowerCase()) return fail("PROSPECTIVE_PERMIT_BINDING_HASH_MISMATCH");
  if (call.nowSeconds >= BigInt(permit.expiresAt) || call.nowSeconds >= BigInt(permit.executionDeadline) || call.attestationExpiry <= call.nowSeconds || call.attestationExpiry > BigInt(permit.expiresAt) || call.attestationExpiry > BigInt(intent.executionDeadline)) return fail("PROSPECTIVE_PERMIT_EXPIRED_OR_ATTESTATION_TOO_LONG");
  if (call.targetChainId !== ETHEREUM_SEPOLIA_CHAIN_ID || call.targetChainId !== BigInt(intent.chainId) || !sameAddress(call.safe, intent.safe) || !sameAddress(call.guard, intent.guard) || !sameAddress(call.to, intent.target) || call.value !== BigInt(intent.value) || call.data.toLowerCase() !== intent.calldata.toLowerCase() || call.operation !== intent.operation || call.safeNonce !== BigInt(intent.safeNonce)) return fail("PROSPECTIVE_SAFE_CALL_BINDING_MISMATCH");
  const permitIdHash = hashText(permit.permitId);
  const mandateIdHash = hashText(mandate.mandateId);
  const adjudicationIdHash = hashText(adjudication.adjudicationId);
  const targetList = [intent.target.toLowerCase()];
  const valueList = [intent.value];
  const calldataList = [intent.calldata.toLowerCase()];
  const canonicalPermitHash = hashText([
    "FIREWALL_CANONICAL_PROSPECTIVE_PERMIT_V1", model.config.contractAddress.toLowerCase(), String(model.config.chainId),
    permitIdHash, mandateIdHash, intent.intentId.toLowerCase(), adjudicationIdHash, String(permit.generation),
    mandate.proposalHash.toLowerCase(), intent.intentHash.toLowerCase(), intent.evidenceHash.toLowerCase(),
    permit.bindingHash.toLowerCase(), String(permit.expiresAt), adjudication.verdict,
  ].join("|"));
  const authorization: SafePermitAuthorization = {
    permitId: permitIdHash, intentId: bytes32(intent.intentId, "intent_id"), mandateId: mandateIdHash,
    executionId: bytes32(intent.intentId, "execution_id"), proposalHash: bytes32(mandate.proposalHash, "proposal_hash"),
    executionBundleHash: bytes32(intent.intentHash, "intent_hash"), targetChainId: call.targetChainId,
    // Safe Guard hashes the actual calldata bytes with keccak256(data).
    // Hashing the printable "0x…" string would create an attestation that the
    // deployed Guard must reject even when every other field matches.
    safe: call.safe, to: call.to, value: call.value, dataHash: keccak256(call.data), operation: call.operation,
    safeNonce: call.safeNonce, targetsDigest: hashText(stable(targetList)), valuesDigest: hashText(stable(valueList)),
    calldataDigest: hashText(stable(calldataList)), codeFactsDigest: hashText(stable({ target_code_hash: intent.targetCodeHash.toLowerCase() })),
    implementationFactsDigest: hashText(stable({ safe_implementation_address: SAFE_SINGLETON, safe_implementation_code_hash: SAFE_SINGLETON_CODE_HASH })),
    targetCodeHash: bytes32(intent.targetCodeHash, "target_code_hash"), implementationAddress: ZERO_ADDRESS,
    implementationCodeHash: `0x${"00".repeat(32)}`, batchStructureHash: hashText(stable({ targets: targetList, values: valueList, calldatas: calldataList, operations: [intent.operation] })),
    adjudicationId: adjudicationIdHash, adjudicationGeneration: BigInt(permit.generation),
    executionDeadline: BigInt(intent.executionDeadline), expiresAt: call.attestationExpiry, canonicalPermitHash,
  };
  return { authorization, typedData: safeGuardTypedData(call.targetChainId, call.guard, authorization), canonicalPermitHash };
}
