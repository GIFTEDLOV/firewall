import { describe, expect, it } from "vitest";
import { analyzeCall, compareExecutionToMandate, detectProxyType, extractSelector, KNOWN_SELECTORS } from "./index.js";

describe("EVM analyzer", () => {
  it("extracts selectors and detects unknown calldata", () => {
    expect(extractSelector("0xa9059cbb" as `0x${string}`)).toBe("0xa9059cbb");
    expect(extractSelector("0x" as `0x${string}`)).toBeNull();
    const result = analyzeCall({ address: "0x0000000000000000000000000000000000000001", calldata: "0xdeadbeef", nativeValue: "0", proxyFacts: { codeHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", bytecodeLength: 100 } });
    expect(result.selector).toBe("0xdeadbeef");
    expect(result.dangerousCapabilities).toContain("UNKNOWN_RUNTIME_BEHAVIOR");
    expect(result.unknowns).toContain("ABI_UNAVAILABLE");
  });

  it("recognizes ERC20 transfer and administrative upgrade selectors", () => {
    const transfer = analyzeCall({ address: "0x0000000000000000000000000000000000000001", calldata: "0xa9059cbb" as `0x${string}`, nativeValue: "0", proxyFacts: { codeHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", bytecodeLength: 100 } });
    expect(transfer.tokenEffects[0]?.kind).toBe("ERC20_TRANSFER");
    const upgrade = analyzeCall({ address: "0x0000000000000000000000000000000000000001", calldata: KNOWN_SELECTORS.upgradeTo as `0x${string}`, nativeValue: "0", proxyFacts: { implementationAddress: "0x0000000000000000000000000000000000000002", implementationCodeHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", codeHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", bytecodeLength: 100 } });
    expect(upgrade.dangerousCapabilities).toContain("UPGRADE");
    expect(detectProxyType({ implementationAddress: "0x0000000000000000000000000000000000000002", adminAddress: "0x0000000000000000000000000000000000000003" })).toBe("TRANSPARENT");
  });

  it("marks policy-relevant target and value changes", () => {
    const mandate = {
      mandateId: "MAN-00000001", governanceSystem: "MANUAL_CANONICAL", governanceChainId: 1, governanceContract: "0x0000000000000000000000000000000000000001", proposalExternalId: "p", proposalHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", proposalSource: "https://example.com/p", proposalTextSha256: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", proposalTextBytes: 10, mandateVersion: 1, createdAt: "2026-10-05T00:00:00.000Z", frozenAt: "2026-10-05T00:00:00.000Z", state: "MANDATE_FROZEN", mandateIdentityHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", constraints: { allowedTargets: ["0x0000000000000000000000000000000000000001"], forbiddenTargets: [], allowedValueTransfer: "NONE", maximumValue: "0", allowedSelectors: [], prohibitedCapabilities: [], protectedEconomicTerms: [], protectedAdminAuthorities: [], protectedOwnership: true, protectedUpgradeScope: true },
    } as never;
    const candidate = { executionId: "EXE-00000001", mandateId: "MAN-00000001", chainId: 1, targets: [analyzeCall({ address: "0x0000000000000000000000000000000000000001", calldata: KNOWN_SELECTORS.upgradeTo as `0x${string}`, nativeValue: "1", proxyFacts: { codeHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", implementationAddress: "0x0000000000000000000000000000000000000002", implementationCodeHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } })], operations: [{ order: 0, targetIndex: 0, kind: "CALL" }], bundleHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", calldataValueDigest: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", importedAt: "2026-10-05T00:00:00.000Z", state: "EXECUTION_IMPORTED" } as never;
    const assessment = compareExecutionToMandate(mandate, candidate);
    expect(assessment.valueChanged).toBe(true);
    expect(assessment.implementationChanged).toBe(true);
    expect(assessment.dangerousCapabilitiesPresent).toBe(true);
  });
});
