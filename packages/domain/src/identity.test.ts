import { describe, expect, it } from "vitest";
import { executionBundleHash, mandateIdentityHash, proposalIdentityHash } from "./identity.js";
import type { ExecutionPackage, MandateConstraints, ProposalIdentity } from "./schemas.js";

const constraints: MandateConstraints = {
  allowedTargets: ["0x0000000000000000000000000000000000000001"],
  forbiddenTargets: [],
  allowedValueTransfer: "NONE",
  maximumValue: "0",
  allowedSelectors: ["0x12345678"],
  prohibitedCapabilities: ["MINT_AUTHORITY"],
  protectedEconomicTerms: ["TREASURY_BALANCE"],
  protectedAdminAuthorities: ["ADMIN_ROLE"],
  protectedOwnership: true,
  protectedUpgradeScope: true,
};

describe("identity bindings", () => {
  it("is stable across object key order", () => {
    const a = { a: "x", b: 1 } as never;
    const b = { b: 1, a: "x" } as never;
    expect(mandateIdentityHash({
      governanceSystem: "MANUAL_CANONICAL",
      governanceChainId: 1,
      governanceContract: "0x0000000000000000000000000000000000000001",
      proposalExternalId: "p-1",
      proposalHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proposalSource: "https://example.com/proposal/1",
      proposalTextSha256: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      proposalTextBytes: 7,
      mandateVersion: 1,
      constraints,
    })).toEqual(mandateIdentityHash({
      governanceSystem: "MANUAL_CANONICAL",
      governanceChainId: 1,
      governanceContract: "0x0000000000000000000000000000000000000001",
      proposalExternalId: "p-1",
      proposalHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proposalSource: "https://example.com/proposal/1",
      proposalTextSha256: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      proposalTextBytes: 7,
      mandateVersion: 1,
      constraints,
    }));
    expect(a).toEqual({ a: "x", b: 1 });
    expect(b).toEqual({ b: 1, a: "x" });
  });

  it("changes proposal identity when authoritative content changes", () => {
    const base: ProposalIdentity = {
      governanceSystem: "SAFE",
      governanceChainId: 1,
      governanceContract: "0x0000000000000000000000000000000000000001",
      proposalExternalId: "safe-1",
      proposalHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      proposalSource: "https://example.com/safe-1",
      proposalTextSha256: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      proposalTextBytes: 10,
    };
    expect(proposalIdentityHash(base)).not.toEqual(proposalIdentityHash({ ...base, proposalTextBytes: 11 }));
  });

  it("changes execution identity when calldata changes", () => {
    const target = {
      address: "0x0000000000000000000000000000000000000001" as const,
      codeHash: null,
      proxyType: "NONE" as const,
      implementationAddress: null,
      implementationCodeHash: null,
      knownAbiProvenance: { source: "NONE" as const, sourceUrl: null, abiSha256: null },
      selector: "0x12345678",
      decodedFunctionName: null,
      decodedArguments: [],
      calldata: "0x12345678",
      nativeValue: "0",
      tokenEffects: [],
      dangerousCapabilities: [],
      unknowns: [],
    };
    const base = { mandateId: "MAN-00000001" as const, chainId: 1, targets: [target], operations: [{ order: 0, targetIndex: 0, kind: "CALL" as const }] };
    const changed: ExecutionPackage["targets"][number] = { ...target, calldata: "0x1234567800" };
    expect(executionBundleHash(base)).not.toEqual(executionBundleHash({ ...base, targets: [changed] }));
  });
});
