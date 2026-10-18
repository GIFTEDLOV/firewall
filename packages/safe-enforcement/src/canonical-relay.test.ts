import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { buildCanonicalRelayAuthorization } from "./canonical-relay.js";

const SAFE = "0x954a62cbc5b48af7342dfd00e40bf2c9f6de9d19" as const;
const TARGET = "0xed34f7bc88749c4ab19e24b3ac43db50afb5f77c" as const;
const GUARD = "0x0000000000000000000000000000000000000003" as const;
const proposalHash = `0x${"11".repeat(32)}`;
const facts = {
  schema: "FIREWALL_EVM_EVIDENCE_V3",
  chain_id: 1,
  governance_contract: SAFE,
  transaction_hash: `0x${"22".repeat(32)}`,
  block_number: 22848240,
  block_hash: `0x${"33".repeat(32)}`,
  parent_block_hash: `0x${"44".repeat(32)}`,
  finality: "HISTORICAL",
  receipt_status: "SUCCESS",
  execution_outcome: "SAFE_EXECUTION_SUCCESS",
  transaction_to: SAFE,
  transaction_value: "0",
  transaction_calldata: "0x1234",
  targets: [TARGET],
  values: ["500000000000000000"],
  calldatas: ["0x"],
  operations: [0],
  safe_implementation_address: "0xd9db270c1b5e3bd161e8c8503c55ceabee709552",
  safe_execution_mode: "SAFE_DIRECT_CALL_ONLY",
  code_hashes: [],
  implementation_hashes: [],
};
const expected = { ...facts, mandate_id: "MAN-00000001" };
const expectedFacts = JSON.stringify(expected);
const evidenceJson = JSON.stringify(facts);
const bindingHash = keccak256(stringToHex([
  "FIREWALL_PERMIT_BINDING_V2", "MAN-00000001", "1", proposalHash.slice(2), "EXE-00000001", "ADJ-00000001", "1", expectedFacts, evidenceJson,
].join("|")));

type CanonicalModel = Parameters<typeof buildCanonicalRelayAuthorization>[0];

function state(overrides: Partial<CanonicalModel> = {}): CanonicalModel {
  return {
    status: "READY",
    source: "LIVE_CANONICAL",
    config: { contractAddress: "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528", chainId: 61999, rpcUrl: "https://studio.genlayer.com/api" },
    asOf: "2026-10-14T00:00:00.000Z",
    evidenceSchema: "FIREWALL_EVM_EVIDENCE_V3",
    semanticSchema: "FIREWALL_MANDATE_V2",
    semanticKeys: [],
    evidence: [],
    mandates: [{ mandateId: "MAN-00000001", creator: "0x0000000000000000000000000000000000000001", governanceChainId: 1, governanceContract: SAFE, proposalExternalId: "historical", proposalHash, proposalSource: "https://example.org/tx", proposalText: "qualification", proposalTextSha256: proposalHash, proposalTextBytes: 13, mandateVersion: 1, mandateDigest: proposalHash, state: "MANDATE_FROZEN", frozenAt: 10 }],
    executions: [{ executionId: "EXE-00000001", mandateId: "MAN-00000001", chainId: 1, expectedFacts, sourceA: "blockscout", sourceB: "routescan", state: "ADJUDICATED", evidenceJson, evidenceStatus: "VERIFIED_POST_EXECUTION", generation: 1 }],
    adjudications: [{ adjudicationId: "ADJ-00000001", executionId: "EXE-00000001", generation: 1, intentSatisfied: true, scopeExpanded: false, prohibitedEffectPresent: false, economicTermsConsistent: true, administrativeAuthorityChanged: false, implementationBehaviorConsistent: true, evidenceSufficient: true, verdict: "EXECUTION_PERMITTED" }],
    permits: [{ permitId: "PRM-00000001", mandateId: "MAN-00000001", mandateVersion: 1, proposalHash, executionId: "EXE-00000001", adjudicationId: "ADJ-00000001", generation: 1, issuedAt: 100, expiresAt: 10000, bindingHash, status: "ACTIVE" }],
    permitStatuses: { "PRM-00000001": "ACTIVE" },
    ...overrides,
  };
}

function call(overrides: Partial<Parameters<typeof buildCanonicalRelayAuthorization>[1]> = {}) {
  return {
    permitId: "PRM-00000001",
    targetChainId: 1n,
    safe: SAFE,
    guard: GUARD,
    to: TARGET,
    value: 500000000000000000n,
    data: "0x" as const,
    operation: 0 as const,
    safeNonce: 4n,
    targetCodeHash: `0x${"55".repeat(32)}` as const,
    expiresAt: 2000n,
    nowSeconds: 1000n,
    ...overrides,
  };
}

const SEPOLIA_SAFE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const SEPOLIA_TARGET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

function sepoliaState(): CanonicalModel {
  const base = state();
  const sepoliaFacts = {
    ...facts,
    chain_id: 11155111,
    governance_contract: SEPOLIA_SAFE,
    transaction_hash: `0x${"77".repeat(32)}`,
    block_number: 123456,
    block_hash: `0x${"88".repeat(32)}`,
    parent_block_hash: `0x${"99".repeat(32)}`,
    transaction_to: SEPOLIA_SAFE,
    targets: [SEPOLIA_TARGET],
    values: ["0"],
    safe_implementation_address: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
  };
  const expectedSepoliaFacts = { ...sepoliaFacts, mandate_id: "MAN-00000001" };
  const sepoliaExpectedJson = JSON.stringify(expectedSepoliaFacts);
  const sepoliaEvidenceJson = JSON.stringify(sepoliaFacts);
  const sepoliaBinding = keccak256(stringToHex([
    "FIREWALL_PERMIT_BINDING_V2", "MAN-00000001", "1", proposalHash.slice(2), "EXE-00000001", "ADJ-00000001", "1",
    sepoliaExpectedJson, sepoliaEvidenceJson,
  ].join("|")));
  return {
    ...base,
    config: {
      contractAddress: "0x1111111111111111111111111111111111111111",
      chainId: 4221,
      rpcUrl: "https://rpc-bradbury.genlayer.com",
      networkAlias: "testnet-bradbury",
    },
    mandates: [{ ...base.mandates[0]!, governanceChainId: 11155111, governanceContract: SEPOLIA_SAFE }],
    executions: [{ ...base.executions[0]!, chainId: 11155111, expectedFacts: sepoliaExpectedJson, evidenceJson: sepoliaEvidenceJson }],
    permits: [{ ...base.permits[0]!, bindingHash: sepoliaBinding }],
  };
}

describe("canonical permit relay attestation", () => {
  it("accepts only the canonical active verdict and exact historical execution tuple", () => {
    const result = buildCanonicalRelayAuthorization(state(), call());
    expect(result.authorization.targetChainId).toBe(1n);
    expect(result.authorization.safe).toBe(SAFE);
    expect(result.authorization.to).toBe(TARGET);
    expect(result.authorization.value).toBe(500000000000000000n);
    expect(result.authorization.operation).toBe(0);
    expect(result.authorization.safeNonce).toBe(4n);
    expect(result.authorization.intentId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.authorization.executionDeadline).toBe(2000n);
    expect(result.authorization.expiresAt).toBe(2000n);
    expect(result.authorization.canonicalPermitHash).toBe(result.canonicalPermitHash);
    expect(result.typedData.domain.verifyingContract).toBe(GUARD);
  });

  it("accepts a Bradbury deployment only through its exact RPC and binds Ethereum Sepolia Safe execution facts", () => {
    const result = buildCanonicalRelayAuthorization(sepoliaState(), call({ targetChainId: 11155111n, safe: SEPOLIA_SAFE, to: SEPOLIA_TARGET, value: 0n }));
    expect(result.authorization.targetChainId).toBe(11155111n);
    expect(result.authorization.safe).toBe(SEPOLIA_SAFE);
    expect(result.typedData.domain.chainId).toBe(11155111n);

    const wrongEndpoint = state({ config: { contractAddress: "0x1111111111111111111111111111111111111111", chainId: 4221, rpcUrl: "https://rpc-asimov.genlayer.com", networkAlias: "testnet-bradbury" } });
    expect(() => buildCanonicalRelayAuthorization(wrongEndpoint, call())).toThrow("LIVE_CANONICAL_STATE_REQUIRED");
  });

  it.each([
    ["wrong chain", { targetChainId: 5n }, "SAFE_CHAIN_NOT_BOUND_TO_CANONICAL_PERMIT"],
    ["wrong Safe", { safe: "0x0000000000000000000000000000000000000008" as const }, "SAFE_CHAIN_NOT_BOUND_TO_CANONICAL_PERMIT"],
    ["wrong target", { to: "0x0000000000000000000000000000000000000008" as const }, "SAFE_TARGET_NOT_BOUND_TO_CANONICAL_PERMIT"],
    ["wrong value", { value: 1n }, "SAFE_VALUE_NOT_BOUND_TO_CANONICAL_PERMIT"],
    ["wrong calldata", { data: "0x12" as const }, "SAFE_CALLDATA_NOT_BOUND_TO_CANONICAL_PERMIT"],
    ["wrong operation", { operation: 1 as const }, "UNSUPPORTED_SAFE_EXECUTION_MODE"],
    ["expired", { nowSeconds: 10000n, expiresAt: 10001n }, "CANONICAL_PERMIT_EXPIRED_OR_ATTESTATION_OUTLIVES_PERMIT"],
    ["execution deadline exceeds attestation expiry", { executionDeadline: 2001n }, "CANONICAL_PERMIT_EXPIRED_OR_ATTESTATION_OUTLIVES_PERMIT"],
  ])("rejects %s", (_name, overrides, error) => {
    expect(() => buildCanonicalRelayAuthorization(state(), call(overrides))).toThrow(error);
  });

  it("rejects inactive or differently bound canonical state", () => {
    expect(() => buildCanonicalRelayAuthorization(state({ permitStatuses: { "PRM-00000001": "EXPIRED" } }), call())).toThrow("CANONICAL_PERMIT_NOT_ACTIVE");
    expect(() => buildCanonicalRelayAuthorization(state({ permits: [{ ...state().permits[0]!, bindingHash: `0x${"00".repeat(32)}` }] }), call())).toThrow("CANONICAL_PERMIT_BINDING_HASH_MISMATCH");
  });

  it("rejects changed adjudication, unsupported implementation facts, and test fixtures", () => {
    expect(() => buildCanonicalRelayAuthorization(state({ source: "TEST_FIXTURE" }), call())).toThrow("LIVE_CANONICAL_STATE_REQUIRED");
    expect(() => buildCanonicalRelayAuthorization(state({ adjudications: [{ ...state().adjudications[0]!, verdict: "EXECUTION_BLOCKED" }] }), call())).toThrow("CANONICAL_PERMIT_ADJUDICATION_INVALID");
    const changedFacts = JSON.stringify({ ...facts, implementation_hashes: [proposalHash] });
    const changedExpected = JSON.stringify({ ...expected, implementation_hashes: [proposalHash] });
    const changedBinding = keccak256(stringToHex(["FIREWALL_PERMIT_BINDING_V2", "MAN-00000001", "1", proposalHash.slice(2), "EXE-00000001", "ADJ-00000001", "1", changedExpected, changedFacts].join("|")));
    const changed = state({
      executions: [{ ...state().executions[0]!, expectedFacts: changedExpected, evidenceJson: changedFacts }],
      permits: [{ ...state().permits[0]!, bindingHash: changedBinding }],
    });
    expect(() => buildCanonicalRelayAuthorization(changed, call())).toThrow("UNSUPPORTED_TARGET_IMPLEMENTATION_IDENTITY");
  });
});
