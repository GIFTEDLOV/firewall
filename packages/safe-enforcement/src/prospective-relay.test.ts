import { describe, expect, it } from "vitest";
import { keccak256, stringToHex, type Hex } from "viem";
import { buildProspectiveRelayAuthorization, type ProspectiveRelayCall } from "./prospective-relay.js";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const OWNER = "0x2222222222222222222222222222222222222222" as const;
const TARGET = "0x3333333333333333333333333333333333333333" as const;
const GUARD = "0x4444444444444444444444444444444444444444" as const;
const SOURCE = "0x5555555555555555555555555555555555555555" as const;
const SINGLETON = "0x41675c099f32341bf84bfc5382af534df5c7461a";
const FACTORY = "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67";
const SINGLETON_HASH = "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4";
const FACTORY_HASH = "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317";
const INTENT_ID = `0x${"66".repeat(32)}` as Hex;
const TX_HASH = `0x${"77".repeat(32)}` as Hex;
const DATA = "0x1234" as Hex;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function hashText(value: string): Hex { return keccak256(stringToHex(value)); }

function model() {
  const mandate = { mandateId: "MAN3-00000001", creator: OWNER, proposalExternalId: "test-proposal", proposalText: "Authorize this one safe call.", proposalHash: `0x${"88".repeat(32)}` as Hex, state: "MANDATE_FROZEN", frozenAt: 1000 };
  const base: Record<string, any> = {
    intentId: INTENT_ID, mandateId: mandate.mandateId, creator: OWNER, chainId: 11155111, safe: SAFE,
    safeNonce: 3, target: TARGET, value: "9", calldata: DATA, calldataHash: keccak256(DATA), operation: 0,
    guard: GUARD, guardCodeHash: `0x${"99".repeat(32)}` as Hex, targetCodeHash: `0x${"aa".repeat(32)}` as Hex,
    safeDeploymentTx: TX_HASH, evidenceBlock: 100, executionDeadline: 1500, permitExpiry: 1600,
    state: "PROSPECTIVE_PERMIT_ISSUED", authenticatedEvidence: "", evidenceHash: `0x${"00".repeat(32)}` as Hex,
    adjudicationId: "ADJ3-00000001",
  };
  const expected = {
    schema: "FIREWALL_PROSPECTIVE_INTENT_V3", intent_id: INTENT_ID, mandate_id: mandate.mandateId,
    owner: OWNER, chain_id: 11155111, safe: SAFE, safe_nonce: 3, target: TARGET, value: "9",
    calldata: DATA, calldata_hash: base.calldataHash, operation: 0, guard: GUARD,
    guard_code_hash: base.guardCodeHash, target_code_hash: base.targetCodeHash,
    safe_deployment_tx: TX_HASH, evidence_block: 100, execution_deadline: 1500, permit_expiry: 1600,
  };
  const authIntent = {
    intent_id: INTENT_ID, owner: OWNER, chain_id: 11155111, safe: SAFE, safe_nonce: 3, target: TARGET,
    value: "9", calldata: DATA, calldata_hash: base.calldataHash, operation: 0, guard: GUARD,
    guard_code_hash: base.guardCodeHash, target_code_hash: base.targetCodeHash, safe_deployment_tx: TX_HASH,
    evidence_block: 100, execution_deadline: 1500, permit_expiry: 1600,
  };
  const providerA = {
    provider: "DRPC_SEPOLIA", chain_id: 11155111,
    snapshot: { number: 100, hash: `0x${"bb".repeat(32)}`, timestamp: 1200 },
    safe_deployment: { transaction_hash: TX_HASH, factory: FACTORY, singleton: SINGLETON, factory_code_hash: FACTORY_HASH, singleton_code_hash: SINGLETON_HASH, block_number: 10, block_hash: `0x${"cc".repeat(32)}`, receipt_status: "SUCCESS", proxy_creation_event: true },
    safe_state: { address: SAFE, proxy_code_hash: `0x${"dd".repeat(32)}`, implementation: SINGLETON, implementation_code_hash: SINGLETON_HASH, owners: [OWNER], threshold: 1, nonce: 3, guard: GUARD, guard_code_hash: base.guardCodeHash, enabled_modules: [] },
    target_state: { address: TARGET, code_hash: base.targetCodeHash, value: "9", calldata_hash: base.calldataHash, operation: 0 },
  };
  const providerB = { ...providerA, provider: "PUBLICNODE_SEPOLIA_BLOCKSCOUT" };
  const evidence = {
    schema: "FIREWALL_PROSPECTIVE_EVIDENCE_V2", evidence_class: "PRE_EXECUTION_CHAIN_STATE", intent: authIntent,
    independently_authenticated: { provider_a: providerA, provider_b: providerB, provider_state_agreement: true, provider_b_receipt_source: "BLOCKSCOUT_SEPOLIA_REST", receipt_claimed_for_future_execution: false },
  };
  const evidenceJson = stable(evidence);
  const intentHash = hashText(stable(expected));
  const evidenceHash = hashText(evidenceJson);
  const adjudication = { adjudicationId: "ADJ3-00000001", intentId: INTENT_ID, generation: 1, intentSatisfied: true, scopeExpanded: false, prohibitedEffectPresent: false, economicTermsConsistent: true, administrativeAuthorityChanged: false, implementationBehaviorConsistent: true, evidenceSufficient: true, verdict: "PROSPECTIVE_AUTHORIZED" };
  const permit = { permitId: "PPR-00000001", intentId: INTENT_ID, mandateId: mandate.mandateId, adjudicationId: adjudication.adjudicationId, generation: 1, issuedAt: 1250, executionDeadline: 1500, expiresAt: 1600, intentHash, evidenceHash, bindingHash: "" as Hex, status: "ACTIVE" };
  permit.bindingHash = hashText([
    "FIREWALL_PROSPECTIVE_PERMIT_V3", mandate.mandateId, mandate.proposalHash.slice(2), INTENT_ID, intentHash, evidenceHash,
    adjudication.adjudicationId, "1", "11155111", SAFE, "3", TARGET, "9", base.calldataHash,
    "0", GUARD, base.guardCodeHash, "1500", "1600",
  ].join("|"));
  base.intentHash = intentHash;
  base.authenticatedEvidence = evidenceJson;
  base.evidenceHash = evidenceHash;
  const value = {
    status: "READY", source: "LIVE_CANONICAL", config: { contractAddress: SOURCE, chainId: 61999, rpcUrl: "https://studio.genlayer.com/api", networkAlias: "studionet", expectedSourceSha256: "a".repeat(64) },
    asOf: "2026-10-17T00:00:00.000Z", schema: "FIREWALL_PROSPECTIVE_INTENT_V3",
    mandates: [mandate], intents: [base], adjudications: [adjudication], permits: [permit], permitStatuses: { [permit.permitId]: "ACTIVE" },
  };
  return value as never;
}

function call(overrides: Partial<ProspectiveRelayCall> = {}): ProspectiveRelayCall {
  return { permitId: "PPR-00000001", guard: GUARD, targetChainId: 11155111n, safe: SAFE, to: TARGET, value: 9n, data: DATA, operation: 0, safeNonce: 3n, nowSeconds: 1300n, attestationExpiry: 1400n, ...overrides };
}

describe("prospective canonical GenLayer relay", () => {
  it("signs only a finalized active permit whose frozen intent and two provider snapshots agree", () => {
    const result = buildProspectiveRelayAuthorization(model(), call());
    expect(result.authorization.targetChainId).toBe(11155111n);
    expect(result.authorization.intentId).toBe(INTENT_ID);
    expect(result.authorization.executionDeadline).toBe(1500n);
    expect(result.authorization.expiresAt).toBe(1400n);
    expect(result.authorization.safe).toBe(SAFE);
  });

  it("accepts a pre-install snapshot only when the next owner-signed Safe nonce installs the intended Guard", () => {
    const pending = model() as Record<string, any>;
    const intent = pending.intents[0];
    const pair = JSON.parse(intent.authenticatedEvidence);
    for (const key of ["provider_a", "provider_b"]) {
      pair.independently_authenticated[key].safe_state = {
        ...pair.independently_authenticated[key].safe_state,
        nonce: 2,
        guard: "0x0000000000000000000000000000000000000000",
        intended_guard: GUARD,
        guard_installation_pending: true,
        planned_execution_nonce: 3,
      };
    }
    intent.authenticatedEvidence = stable(pair);
    const evidenceHash = hashText(intent.authenticatedEvidence);
    intent.evidenceHash = evidenceHash;
    pending.permits[0].evidenceHash = evidenceHash;
    pending.permits[0].bindingHash = hashText([
      "FIREWALL_PROSPECTIVE_PERMIT_V3", pending.mandates[0].mandateId, pending.mandates[0].proposalHash.slice(2),
      intent.intentId, intent.intentHash, evidenceHash, pending.adjudications[0].adjudicationId, "1", "11155111",
      SAFE, "3", TARGET, "9", intent.calldataHash, "0", GUARD, intent.guardCodeHash, "1500", "1600",
    ].join("|"));
    expect(buildProspectiveRelayAuthorization(pending as never, call()).authorization.safeNonce).toBe(3n);
  });

  it("rejects fixture state, stale permits, altered facts and every mismatched call field", () => {
    const canonical = model() as Record<string, any>;
    const cases: Array<[string, Partial<ProspectiveRelayCall>]> = [
      ["chain", { targetChainId: 1n }], ["safe", { safe: OWNER }], ["guard", { guard: OWNER }],
      ["target", { to: OWNER }], ["value", { value: 10n }], ["calldata", { data: "0xab" }],
      ["operation", { operation: 1 }], ["nonce", { safeNonce: 4n }],
    ];
    for (const [label, override] of cases) expect(() => buildProspectiveRelayAuthorization(model(), call(override))).toThrow("PROSPECTIVE_SAFE_CALL_BINDING_MISMATCH");
    const fixture = { ...canonical, source: "TEST_FIXTURE" } as never;
    expect(() => buildProspectiveRelayAuthorization(fixture, call())).toThrow("LIVE_PROSPECTIVE_CANONICAL_STATE_REQUIRED");
    const expired = { ...canonical, permitStatuses: { "PPR-00000001": "EXPIRED" } } as never;
    expect(() => buildProspectiveRelayAuthorization(expired, call())).toThrow("PROSPECTIVE_CANONICAL_PERMIT_NOT_ACTIVE");
    const altered = structuredClone(canonical) as any;
    altered.intents[0].authenticatedEvidence = altered.intents[0].authenticatedEvidence.replace("\"nonce\":3", "\"nonce\":4");
    expect(() => buildProspectiveRelayAuthorization(altered as never, call())).toThrow("PROSPECTIVE_PROVIDER_FACTS_DISAGREE");
    const badBinding = structuredClone(canonical) as any;
    badBinding.permits[0].bindingHash = `0x${"00".repeat(32)}`;
    expect(() => buildProspectiveRelayAuthorization(badBinding as never, call())).toThrow("PROSPECTIVE_PERMIT_BINDING_HASH_MISMATCH");
    expect(() => buildProspectiveRelayAuthorization(model(), call({ attestationExpiry: 1501n }))).toThrow("PROSPECTIVE_PERMIT_EXPIRED_OR_ATTESTATION_TOO_LONG");
    expect(() => buildProspectiveRelayAuthorization(model(), call({ nowSeconds: 1600n }))).toThrow("PROSPECTIVE_PERMIT_EXPIRED_OR_ATTESTATION_TOO_LONG");
    const badPendingNonce = structuredClone(canonical) as any;
    const pair = JSON.parse(badPendingNonce.intents[0].authenticatedEvidence);
    pair.independently_authenticated.provider_a.safe_state.nonce = 1;
    pair.independently_authenticated.provider_b.safe_state.nonce = 1;
    badPendingNonce.intents[0].authenticatedEvidence = stable(pair);
    badPendingNonce.intents[0].evidenceHash = hashText(badPendingNonce.intents[0].authenticatedEvidence);
    badPendingNonce.permits[0].evidenceHash = badPendingNonce.intents[0].evidenceHash;
    expect(() => buildProspectiveRelayAuthorization(badPendingNonce as never, call())).toThrow("PROSPECTIVE_SAFE_STATE_INVALID");
  });

  it("accepts only the V3.9 PublicNode plus Blockscout evidence schema", () => {
    const oldProvider = structuredClone(model()) as any;
    const oldEvidence = JSON.parse(oldProvider.intents[0].authenticatedEvidence);
    oldEvidence.independently_authenticated.provider_b.provider = "TENDERLY_SEPOLIA";
    oldProvider.intents[0].authenticatedEvidence = stable(oldEvidence);
    expect(() => buildProspectiveRelayAuthorization(oldProvider as never, call())).toThrow("PROSPECTIVE_PROVIDER_IDENTITY_MISMATCH");

    const missingReceiptSource = structuredClone(model()) as any;
    const evidence = JSON.parse(missingReceiptSource.intents[0].authenticatedEvidence);
    delete evidence.independently_authenticated.provider_b_receipt_source;
    missingReceiptSource.intents[0].authenticatedEvidence = stable(evidence);
    expect(() => buildProspectiveRelayAuthorization(missingReceiptSource as never, call())).toThrow("PROSPECTIVE_PROVIDER_IDENTITY_MISMATCH");
  });
});
