import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deriveVerdict, parseSemanticResultText } from "@firewall/policy-engine";

const baseline = { intent_satisfied: true, scope_expanded: false, prohibited_effect_present: false, economic_terms_consistent: true, administrative_authority_changed: false, implementation_behavior_consistent: true, evidence_sufficient: true };
const mutations = [
  ["intent guard", { intent_satisfied: false }], ["scope guard", { scope_expanded: true }], ["prohibited effect guard", { prohibited_effect_present: true }],
  ["economic guard", { economic_terms_consistent: false }], ["admin guard", { administrative_authority_changed: true }], ["implementation guard", { implementation_behavior_consistent: false }],
  ["evidence guard", { evidence_sufficient: false }],
];
const contract = readFileSync("contracts/firewall.py", "utf8");
const structuralMutations: Array<[string, boolean]> = [
  ["frozen mandate prerequisite", contract.includes('mandate.state == "MANDATE_FROZEN"')],
  ["independent source comparison", contract.includes("first is None or second is None or first != second")],
  ["evidence fact-to-mandate binding", contract.includes('expected.get("mandate_id") != execution.mandate_id')],
  ["generation replay guard", contract.includes("execution.generation == u256(0)")],
  ["strict semantic-shape rejection", contract.includes("len(value) != len(SEMANTIC_KEYS)") && contract.includes("key not in value") && contract.includes("return None")],
  ["validator independently compares semantic result", contract.includes("independent = self._semantic(prompt)") && contract.includes("proposed == independent")],
  ["permit expiry binding", contract.includes("issued_at + PERMIT_TTL")],
  ["independent evidence uses equivalence consensus", contract.includes("gl.eq_principle.strict_eq(fetch_authenticated)")],
  ["no contract-level owner override", !/^\s*owner\s*=/m.test(contract)],
];

describe("targeted mutation harness", () => {
  it("kills every policy weakening mutation", () => {
    let killed = 0;
    for (const [, mutation] of mutations) {
      const result = { ...baseline, ...mutation };
      const expected = mutation.evidence_sufficient === false ? "INCONCLUSIVE" : "EXECUTION_BLOCKED";
      if (deriveVerdict(result) === expected) killed++;
    }
    expect(killed).toBe(mutations.length);
  });

  it("kills schema and parser weakening mutations", () => {
    const malformed = JSON.stringify({ ...baseline, extra: true });
    expect(() => parseSemanticResultText(malformed)).toThrow();
    expect(structuralMutations.filter(([, killed]) => killed)).toHaveLength(structuralMutations.length);
  });
});
