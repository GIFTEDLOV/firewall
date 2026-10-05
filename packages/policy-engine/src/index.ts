import { SemanticResultSchema, VerdictSchema, type SemanticResult, type Verdict } from "@firewall/domain";

export function deriveVerdict(result: SemanticResult): Verdict {
  const bounded = SemanticResultSchema.parse(result);
  if (!bounded.evidence_sufficient) return "INCONCLUSIVE";
  if (
    bounded.intent_satisfied
    && !bounded.scope_expanded
    && !bounded.prohibited_effect_present
    && bounded.economic_terms_consistent
    && !bounded.administrative_authority_changed
    && bounded.implementation_behavior_consistent
  ) {
    return "EXECUTION_PERMITTED";
  }
  return "EXECUTION_BLOCKED";
}

export function deriveReasons(result: SemanticResult): string[] {
  const bounded = SemanticResultSchema.parse(result);
  const reasons: string[] = [];
  if (!bounded.evidence_sufficient) reasons.push("EVIDENCE_INSUFFICIENT");
  if (!bounded.intent_satisfied) reasons.push("INTENT_NOT_SATISFIED");
  if (bounded.scope_expanded) reasons.push("SCOPE_EXPANDED");
  if (bounded.prohibited_effect_present) reasons.push("PROHIBITED_EFFECT_PRESENT");
  if (!bounded.economic_terms_consistent) reasons.push("ECONOMIC_TERMS_INCONSISTENT");
  if (bounded.administrative_authority_changed) reasons.push("ADMINISTRATIVE_AUTHORITY_CHANGED");
  if (!bounded.implementation_behavior_consistent) reasons.push("IMPLEMENTATION_BEHAVIOR_INCONSISTENT");
  return reasons;
}

export function assertBoundedVerdict(verdict: string): Verdict {
  return VerdictSchema.parse(verdict);
}
