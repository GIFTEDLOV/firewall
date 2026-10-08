import type { CanonicalLiveReadModel } from "@firewall/genlayer-client";

const hash = (digit: string) => `0x${digit.repeat(64)}`;
const address = (digit: string) => `0x${digit.repeat(40)}`;

/**
 * Deterministic browser-test data only. Production cannot enter this branch:
 * loadCanonical rejects test fixtures when NODE_ENV is production.
 */
export const canonicalTestFixture: CanonicalLiveReadModel = {
  status: "READY",
  config: { contractAddress: "0xEFD65978F54318349139c93c1576ED3eb6f187b6", chainId: 61997, rpcUrl: "https://studio-dev.genlayer.com/api" },
  asOf: "2026-10-08T00:00:00.000Z",
  semanticSchema: "FIREWALL_MANDATE_V1",
  semanticKeys: ["intent_satisfied", "scope_expanded", "prohibited_effect_present", "economic_terms_consistent", "administrative_authority_changed", "implementation_behavior_consistent", "evidence_sufficient"],
  mandates: [{ creator: address("1"), frozenAt: 100, governanceChainId: 61997, governanceContract: address("2"), mandateDigest: hash("3"), mandateId: "MAN-00000001", mandateVersion: 1, proposalExternalId: "oz-governor-42", proposalHash: hash("4"), proposalSource: "controlled://governance/oz/42", proposalText: "Upgrade TreasuryVault to add batched withdrawals. No new administrator authority. No ownership change. No mint authority. No treasury transfer. Existing withdrawal permissions remain unchanged.", proposalTextBytes: 166, proposalTextSha256: hash("5"), state: "MANDATE_FROZEN" }],
  executions: [
    { bundleHash: hash("6"), calldataDigest: hash("7"), chainId: 61127, codeFactsDigest: hash("8"), evidenceHash: hash("9"), executionId: "EXE-00000001", expectedEvidenceHash: hash("9"), generation: 1, implementationHashesDigest: hash("a"), mandateId: "MAN-00000001", semanticInput: "CONTROLLED_FIXTURE_EXECUTION_A: batching only; no authority change", state: "ADJUDICATED", targetCodeHashesDigest: hash("b"), targetsDigest: hash("c"), valuesDigest: hash("d") },
    { bundleHash: hash("e"), calldataDigest: hash("f"), chainId: 61127, codeFactsDigest: hash("1"), evidenceHash: hash("2"), executionId: "EXE-00000002", expectedEvidenceHash: hash("2"), generation: 1, implementationHashesDigest: hash("3"), mandateId: "MAN-00000001", semanticInput: "CONTROLLED_FIXTURE_EXECUTION_B: batching plus privileged redirect withdrawals", state: "ADJUDICATED", targetCodeHashesDigest: hash("4"), targetsDigest: hash("5"), valuesDigest: hash("6") },
  ],
  evidence: [
    { authenticatedAt: 105, authorityDigest: hash("7"), contentSha256: hash("8"), evidenceHash: hash("9"), exactByteLength: 32, executionId: "EXE-00000001", schemaVersion: "FIREWALL_EVIDENCE_V1", sourceDigest: hash("a") },
    { authenticatedAt: 106, authorityDigest: hash("b"), contentSha256: hash("c"), evidenceHash: hash("d"), exactByteLength: 32, executionId: "EXE-00000002", schemaVersion: "FIREWALL_EVIDENCE_V1", sourceDigest: hash("e") },
  ],
  adjudications: [
    { adjudicationId: "ADJ-00000001", administrativeAuthorityChanged: false, createdAt: 110, economicTermsConsistent: true, evidenceHash: hash("9"), evidenceSufficient: true, executionId: "EXE-00000001", generation: 1, implementationBehaviorConsistent: true, intentSatisfied: true, mandateId: "MAN-00000001", prohibitedEffectPresent: false, scopeExpanded: false, semanticSchema: "FIREWALL_MANDATE_V1", verdict: "EXECUTION_PERMITTED" },
    { adjudicationId: "ADJ-00000002", administrativeAuthorityChanged: true, createdAt: 111, economicTermsConsistent: false, evidenceHash: hash("d"), evidenceSufficient: false, executionId: "EXE-00000002", generation: 1, implementationBehaviorConsistent: false, intentSatisfied: false, mandateId: "MAN-00000001", prohibitedEffectPresent: true, scopeExpanded: true, semanticSchema: "FIREWALL_MANDATE_V1", verdict: "INCONCLUSIVE" },
  ],
  permits: [{ adjudicationGeneration: 1, adjudicationId: "ADJ-00000001", calldataDigest: hash("7"), chainId: 61127, executionBundleHash: hash("6"), executionId: "EXE-00000001", expiresAt: 86520, implementationHashesDigest: hash("a"), issuedAt: 120, mandateId: "MAN-00000001", mandateVersion: 1, permitBindingHash: hash("f"), permitId: "PRM-00000001", proposalHash: hash("4"), semanticSchema: "FIREWALL_MANDATE_V1", status: "ACTIVE", targetCodeHashesDigest: hash("b"), targetsDigest: hash("c"), valuesDigest: hash("d") }],
  permitStatuses: { "PRM-00000001": "EXPIRED" },
};
