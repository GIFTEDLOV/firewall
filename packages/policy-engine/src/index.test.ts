import { describe, expect, it } from "vitest";
import { deriveReasons, deriveVerdict } from "./index.js";

const allowed = {
  intent_satisfied: true,
  scope_expanded: false,
  prohibited_effect_present: false,
  economic_terms_consistent: true,
  administrative_authority_changed: false,
  implementation_behavior_consistent: true,
  evidence_sufficient: true,
};

describe("deterministic policy", () => {
  it("permits only the complete satisfying vector", () => {
    expect(deriveVerdict(allowed)).toBe("EXECUTION_PERMITTED");
  });

  it("blocks a sufficient but unsafe vector", () => {
    expect(deriveVerdict({ ...allowed, administrative_authority_changed: true })).toBe("EXECUTION_BLOCKED");
    expect(deriveReasons({ ...allowed, administrative_authority_changed: true })).toEqual(["ADMINISTRATIVE_AUTHORITY_CHANGED"]);
  });

  it("keeps insufficient evidence distinct from block", () => {
    expect(deriveVerdict({ ...allowed, evidence_sufficient: false })).toBe("INCONCLUSIVE");
  });

  it("rejects extra consensus keys", () => {
    expect(() => deriveVerdict({ ...allowed, confidence: 0.9 } as never)).toThrow();
  });
});
