import type { CanonicalLiveReadModel } from "@firewall/genlayer-client";

const hash = (digit: string) => `0x${digit.repeat(64)}`;
const address = (digit: string) => `0x${digit.repeat(40)}`;
const facts = (description: string) => JSON.stringify({
  schema: "FIREWALL_EVM_EVIDENCE_V3",
  chain_id: 1,
  governance_contract: address("2"),
  transaction_hash: hash(description === "A" ? "2" : "3"),
  finality: "HISTORICAL",
  receipt_status: "SUCCESS",
  execution_outcome: "SAFE_EXECUTION_SUCCESS",
});

/** Deterministic browser-test data; the model carries an explicit fixture source tag. */
export const canonicalTestFixture: CanonicalLiveReadModel = {
  status: "READY",
  source: "TEST_FIXTURE",
  config: { contractAddress: "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528", chainId: 61999, rpcUrl: "https://studio.genlayer.com/api" },
  asOf: "2026-10-08T00:00:00.000Z",
  evidenceSchema: "FIREWALL_EVM_EVIDENCE_V3",
  semanticSchema: "FIREWALL_MANDATE_V2",
  semanticKeys: ["intent_satisfied", "scope_expanded", "prohibited_effect_present", "economic_terms_consistent", "administrative_authority_changed", "implementation_behavior_consistent", "evidence_sufficient"],
  mandates: [{ creator: address("1"), governanceChainId: 1, governanceContract: address("2"), proposalExternalId: "proposal-42", proposalHash: hash("4"), proposalSource: "https://example.test/proposal-42", proposalText: "Upgrade TreasuryVault to add batching. No authority change.", proposalTextSha256: hash("5"), proposalTextBytes: 58, mandateVersion: 1, mandateDigest: hash("6"), state: "MANDATE_FROZEN", frozenAt: 100, mandateId: "MAN-00000001" }],
  executions: [
    { executionId: "EXE-00000001", mandateId: "MAN-00000001", chainId: 1, expectedFacts: facts("A"), sourceA: "https://a.example.test/tx", sourceB: "https://b.example.test/tx", state: "ADJUDICATED", evidenceJson: facts("A"), evidenceStatus: "VERIFIED_POST_EXECUTION", generation: 1 },
    { executionId: "EXE-00000002", mandateId: "MAN-00000001", chainId: 1, expectedFacts: facts("B"), sourceA: "https://a.example.test/tx", sourceB: "https://b.example.test/tx", state: "ADJUDICATED", evidenceJson: facts("B"), evidenceStatus: "VERIFIED_POST_EXECUTION", generation: 1 },
  ],
  evidence: [
    { executionId: "EXE-00000001", evidenceStatus: "VERIFIED_POST_EXECUTION", factsJson: facts("A") },
    { executionId: "EXE-00000002", evidenceStatus: "VERIFIED_POST_EXECUTION", factsJson: facts("B") },
  ],
  adjudications: [
    { adjudicationId: "ADJ-00000001", executionId: "EXE-00000001", generation: 1, intentSatisfied: true, scopeExpanded: false, prohibitedEffectPresent: false, economicTermsConsistent: true, administrativeAuthorityChanged: false, implementationBehaviorConsistent: true, evidenceSufficient: true, verdict: "EXECUTION_PERMITTED" },
    { adjudicationId: "ADJ-00000002", executionId: "EXE-00000002", generation: 1, intentSatisfied: false, scopeExpanded: true, prohibitedEffectPresent: true, economicTermsConsistent: false, administrativeAuthorityChanged: true, implementationBehaviorConsistent: false, evidenceSufficient: false, verdict: "INCONCLUSIVE" },
  ],
  permits: [{ permitId: "PRM-00000001", mandateId: "MAN-00000001", mandateVersion: 1, proposalHash: hash("4"), executionId: "EXE-00000001", adjudicationId: "ADJ-00000001", generation: 1, issuedAt: 120, expiresAt: 86520, bindingHash: hash("a"), status: "ACTIVE" }],
  permitStatuses: { "PRM-00000001": "EXPIRED" },
};
