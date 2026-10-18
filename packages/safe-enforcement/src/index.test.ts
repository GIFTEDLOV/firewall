import { describe, expect, it } from "vitest";
import { safeGuardExecutionKey, safeGuardTypedData } from "./index.js";

describe("Safe guard bindings", () => {
  it("binds the exact Safe nonce/call tuple", () => {
    const common = { targetChainId: 31337n, safe: "0x0000000000000000000000000000000000000001" as `0x${string}`, to: "0x0000000000000000000000000000000000000002" as `0x${string}`, value: 0n, dataHash: `0x${"11".repeat(32)}` as `0x${string}`, operation: 0 as const, safeNonce: 7n };
    expect(safeGuardExecutionKey(common)).not.toBe(safeGuardExecutionKey({ ...common, safeNonce: 8n }));
    const typed = safeGuardTypedData(31337, "0x0000000000000000000000000000000000000003", { ...common, permitId: `0x${"01".repeat(32)}`, intentId: `0x${"16".repeat(32)}`, mandateId: `0x${"02".repeat(32)}`, executionId: `0x${"03".repeat(32)}`, proposalHash: `0x${"04".repeat(32)}`, executionBundleHash: `0x${"05".repeat(32)}`, targetsDigest: `0x${"06".repeat(32)}`, valuesDigest: `0x${"07".repeat(32)}`, calldataDigest: `0x${"08".repeat(32)}`, codeFactsDigest: `0x${"09".repeat(32)}`, implementationFactsDigest: `0x${"0a".repeat(32)}`, targetCodeHash: `0x${"0b".repeat(32)}`, implementationAddress: "0x0000000000000000000000000000000000000000", implementationCodeHash: `0x${"00".repeat(32)}`, batchStructureHash: `0x${"0c".repeat(32)}`, adjudicationId: `0x${"0d".repeat(32)}`, adjudicationGeneration: 1n, executionDeadline: 4102444800n, expiresAt: 4102444800n, canonicalPermitHash: `0x${"0e".repeat(32)}` });
    expect(typed.domain.name).toBe("FirewallSafeGuard");
    expect(typed.primaryType).toBe("PermitAuthorization");
  });
});
