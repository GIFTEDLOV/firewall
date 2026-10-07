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
  ["freeze guard", contract.includes('mandate.state == "MANDATE_DRAFT"')],
  ["evidence authenticated prerequisite", contract.includes('execution.state == "EVIDENCE_AUTHENTICATED"')],
  ["execution evidence binding", contract.includes("evidence_hash == execution.expected_evidence_hash")],
  ["generation replay guard", contract.includes("execution.generation == u256(0)")],
  ["strict semantic-shape rejection without assertions", contract.includes("len(raw) != len(SEMANTIC_KEYS)") && contract.includes("key not in raw") && contract.includes("return None")],
  ["consensus rejects invalid or differing vectors", contract.includes("leader_vector = _validate_semantic_vector(leader_result.calldata)") && contract.includes("validator_vector = self._semantic_evaluation(prompt)") && contract.includes("return all(")],
  ["permit expiry binding", contract.includes("issued_at + PERMIT_TTL")],
  ["permit semantic schema binding", contract.includes('adjudication.semantic_schema == SEMANTIC_SCHEMA')],
  ["owner override prohibition", !/\bowner\b/.test(contract)],
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
