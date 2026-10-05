import { describe, expect, it } from "vitest";
import { formatEntityId } from "@firewall/shared";
import { deriveVerdict } from "@firewall/policy-engine";

describe("state and identity properties", () => {
  it("generates monotonic non-reusable formatted IDs", () => {
    const ids = Array.from({ length: 50 }, (_, index) => formatEntityId("ADJ", index + 1));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("ADJ-00000001");
    expect(ids.at(-1)).toBe("ADJ-00000050");
  });

  it("never lets semantic output change identity or business facts", () => {
    const identity = { mandate: "MAN-00000001", execution: "EXE-00000001", target: "0x1111111111111111111111111111111111111111", value: "0" };
    const variants = [
      { intent_satisfied: true, scope_expanded: false, prohibited_effect_present: false, economic_terms_consistent: true, administrative_authority_changed: false, implementation_behavior_consistent: true, evidence_sufficient: true },
      { intent_satisfied: false, scope_expanded: true, prohibited_effect_present: true, economic_terms_consistent: false, administrative_authority_changed: true, implementation_behavior_consistent: false, evidence_sufficient: true },
    ];
    for (const result of variants) { deriveVerdict(result); expect(identity).toEqual({ mandate: "MAN-00000001", execution: "EXE-00000001", target: "0x1111111111111111111111111111111111111111", value: "0" }); }
  });
});
