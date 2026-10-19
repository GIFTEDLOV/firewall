import { describe, expect, it } from "vitest";
import { assertProtectedExecutionReady, createLocalWorkflowRuntime } from "./index.js";

function emptyCanonicalReader() {
  return {
    async read() {
      return { mandates: [], executions: [], adjudications: [], permits: [], asOf: new Date(0).toISOString() };
    },
  };
}

describe("local pre-chain workflow boundary", () => {
  it("never presents local state as canonical state", async () => {
    const runtime = createLocalWorkflowRuntime(emptyCanonicalReader());
    const model = await runtime.readModel();

    expect(model.mandates).toEqual([]);
    expect(model.executions).toEqual([]);
    expect(model.localDrafts).toEqual([]);
    expect(model.localExecutions).toEqual([]);
  });

  it("uses the deterministic policy for local semantic previews", () => {
    const runtime = createLocalWorkflowRuntime(emptyCanonicalReader());

    expect(runtime.predictSemanticResult({
      intent_satisfied: true,
      scope_expanded: false,
      prohibited_effect_present: false,
      economic_terms_consistent: true,
      administrative_authority_changed: false,
      implementation_behavior_consistent: true,
      evidence_sufficient: false,
    }).verdict).toBe("INCONCLUSIVE");
  });

  it("does not prepare protected execution from local or stale claims", () => {
    expect(() => assertProtectedExecutionReady({ evidenceStatus: "UNVERIFIED", permit: null, canonicalPermitRead: false, attestationVerified: false, targetChainId: 1, safeAddress: "0x1111111111111111111111111111111111111111", permitSafeAddress: "0x1111111111111111111111111111111111111111", executionBundleHash: "0xaa", permitExecutionBundleHash: "0xaa", nowOnTargetChain: 1 })).toThrow("PROTECTED_EXECUTION_REQUIRES_VERIFIED_EVIDENCE");
  });
});
