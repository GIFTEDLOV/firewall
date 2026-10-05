import { evidenceBundleHash, EvidenceBundleSchema, type EvidenceBundle } from "@firewall/domain";

export function authenticateEvidenceBundle(input: Omit<EvidenceBundle, "bundleHash" | "authenticatedAt" | "status"> & { authenticatedAt?: string | null }): EvidenceBundle {
  const bundleHash = evidenceBundleHash(input);
  return EvidenceBundleSchema.parse({
    ...input,
    bundleHash,
    authenticatedAt: input.authenticatedAt ?? new Date().toISOString(),
    status: "AUTHENTICATED",
  });
}

export function evidenceMatchesExpected(bundle: EvidenceBundle, expected: { mandateId: string; executionId: string; proposalIdentityHash: string; bundleHash: string }): boolean {
  return bundle.mandateId === expected.mandateId
    && bundle.executionId === expected.executionId
    && bundle.proposalIdentityHash.toLowerCase() === expected.proposalIdentityHash.toLowerCase()
    && bundle.bundleHash.toLowerCase() === expected.bundleHash.toLowerCase();
}

export function evidenceFailureStatus(input: { sourceAvailable: boolean; contentMatches: boolean }): "AUTHENTICATED" | "SOURCE_UNAVAILABLE" | "EVIDENCE_MISMATCH" {
  if (!input.sourceAvailable) return "SOURCE_UNAVAILABLE";
  if (!input.contentMatches) return "EVIDENCE_MISMATCH";
  return "AUTHENTICATED";
}
