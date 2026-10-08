import { describe, expect, it } from "vitest";
import { createLocalWorkflowRuntime } from "./index.js";

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
});
