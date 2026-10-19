import { evidenceBundleHash, EvidenceBundleSchema, type EvidenceBundle } from "@firewall/domain";

export type EvidenceStatus =
  | "PENDING" | "UNVERIFIED" | "VERIFIED_PRE_EXECUTION" | "VERIFIED_POST_EXECUTION"
  | "SOURCE_UNAVAILABLE" | "EVIDENCE_MISMATCH" | "STALE_EVIDENCE" | "REORG_DETECTED" | "INSUFFICIENT_EVIDENCE";

/** Creates a commitment only. A digest of caller-supplied bytes is not authentication. */
export function createUnverifiedEvidenceBundle(input: Omit<EvidenceBundle, "bundleHash" | "authenticatedAt" | "status"> & { authenticatedAt?: string | null }): EvidenceBundle {
  const bundleHash = evidenceBundleHash(input);
  return EvidenceBundleSchema.parse({ ...input, bundleHash, authenticatedAt: input.authenticatedAt ?? null, status: "UNVERIFIED" });
}

/** @deprecated Compatibility boundary; it intentionally never returns AUTHENTICATED. */
export function authenticateEvidenceBundle(input: Omit<EvidenceBundle, "bundleHash" | "authenticatedAt" | "status"> & { authenticatedAt?: string | null }): EvidenceBundle {
  return createUnverifiedEvidenceBundle(input);
}

export function evidenceMatchesExpected(bundle: EvidenceBundle, expected: { mandateId: string; executionId: string; proposalIdentityHash: string; bundleHash: string }): boolean {
  return bundle.mandateId === expected.mandateId && bundle.executionId === expected.executionId
    && bundle.proposalIdentityHash.toLowerCase() === expected.proposalIdentityHash.toLowerCase()
    && bundle.bundleHash.toLowerCase() === expected.bundleHash.toLowerCase();
}

export function evidenceFailureStatus(input: { sourceAvailable: boolean; contentMatches: boolean; stale?: boolean; reorg?: boolean; insufficient?: boolean }): EvidenceStatus {
  if (!input.sourceAvailable) return "SOURCE_UNAVAILABLE";
  if (input.reorg) return "REORG_DETECTED";
  if (input.stale) return "STALE_EVIDENCE";
  if (input.insufficient) return "INSUFFICIENT_EVIDENCE";
  if (!input.contentMatches) return "EVIDENCE_MISMATCH";
  return "UNVERIFIED";
}

export function validateEvidenceBinding(bundle: EvidenceBundle, expected: { mandateId: string; executionId: string; proposalIdentityHash: string; chainId: number }): EvidenceStatus {
  if (["SOURCE_UNAVAILABLE", "REORG_DETECTED", "STALE_EVIDENCE", "INSUFFICIENT_EVIDENCE"].includes(bundle.status)) return bundle.status as EvidenceStatus;
  const identityMatches = bundle.mandateId === expected.mandateId && bundle.executionId === expected.executionId
    && bundle.proposalIdentityHash.toLowerCase() === expected.proposalIdentityHash.toLowerCase()
    && bundle.entries.every((entry) => entry.chainId === expected.chainId && entry.executionId === expected.executionId);
  if (!identityMatches) return "EVIDENCE_MISMATCH";
  if (bundle.entries.some((entry) => entry.freshnessExpiresAt !== null && (!bundle.authenticatedAt || entry.freshnessExpiresAt < bundle.authenticatedAt))) return "STALE_EVIDENCE";
  if (bundle.status === "VERIFIED_PRE_EXECUTION" || bundle.status === "VERIFIED_POST_EXECUTION") return bundle.status;
  return bundle.status === "EVIDENCE_MISMATCH" ? "EVIDENCE_MISMATCH" : "UNVERIFIED";
}

export * from "./evm.js";
