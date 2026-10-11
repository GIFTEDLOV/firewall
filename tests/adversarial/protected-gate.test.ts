import { describe, expect, it } from "vitest";
import { assertProtectedExecutionReady } from "@firewall/workflow";
import type { Permit } from "@firewall/domain";

const hash = `0x${"11".repeat(32)}` as `0x${string}`;
const permit: Permit = {
  permitId: "PRM-00000001", mandateId: "MAN-00000001", mandateVersion: 1, proposalHash: hash, executionId: "EXE-00000001", executionBundleHash: hash, chainId: 1,
  targetsDigest: hash, valuesDigest: hash, calldataDigest: hash, targetCodeHashesDigest: hash, implementationHashesDigest: hash,
  adjudicationId: "ADJ-00000001", adjudicationGeneration: 1, semanticSchema: "FIREWALL_MANDATE_V1", issuedAt: "2026-10-10T00:00:00.000Z", expiresAt: "2026-10-12T00:00:00.000Z", permitBindingHash: hash, status: "ACTIVE",
};
const base = { evidenceStatus: "VERIFIED_PRE_EXECUTION" as const, permit, canonicalPermitRead: true, attestationVerified: true, targetChainId: 1, safeAddress: "0x0000000000000000000000000000000000000002" as `0x${string}`, permitSafeAddress: "0x0000000000000000000000000000000000000002" as `0x${string}`, executionBundleHash: hash, permitExecutionBundleHash: hash, nowOnTargetChain: 1791504000 };

describe("protected execution gate adversarial matrix", () => {
  it("accepts only an active, attested, exact, unexpired binding", () => {
    expect(() => assertProtectedExecutionReady(base)).not.toThrow();
  });
  it.each([
    ["local evidence", { evidenceStatus: "UNVERIFIED" }],
    ["missing canonical read", { canonicalPermitRead: false }],
    ["unverified relay", { attestationVerified: false }],
    ["wrong chain", { targetChainId: 5 }],
    ["wrong safe", { safeAddress: "0x0000000000000000000000000000000000000003" }],
    ["wrong bundle", { executionBundleHash: `0x${"22".repeat(32)}` }],
    ["expired target time", { nowOnTargetChain: 1791849600 }],
  ])("rejects %s", (_label, patch) => {
    expect(() => assertProtectedExecutionReady({ ...base, ...patch } as never)).toThrow();
  });
});
