import type { Permit } from "@firewall/domain";
import type { EvidenceStatus } from "@firewall/evidence";

export type ProtectedExecutionContext = {
  readonly evidenceStatus: EvidenceStatus;
  readonly permit: Permit | null;
  readonly canonicalPermitRead: boolean;
  readonly attestationVerified: boolean;
  readonly targetChainId: number;
  readonly safeAddress: `0x${string}`;
  readonly permitSafeAddress: `0x${string}`;
  readonly executionBundleHash: string;
  readonly permitExecutionBundleHash: string;
  readonly nowOnTargetChain: number;
};

/** Fail-closed application boundary before handing a call to an enforcement adapter. */
export function assertProtectedExecutionReady(input: ProtectedExecutionContext): void {
  if (input.evidenceStatus !== "VERIFIED_PRE_EXECUTION" && input.evidenceStatus !== "VERIFIED_POST_EXECUTION") throw new Error("PROTECTED_EXECUTION_REQUIRES_VERIFIED_EVIDENCE");
  if (!input.canonicalPermitRead || !input.permit) throw new Error("CANONICAL_PERMIT_READ_REQUIRED");
  if (input.permit.status !== "ACTIVE") throw new Error("CANONICAL_PERMIT_NOT_ACTIVE");
  if (!input.attestationVerified) throw new Error("GENLAYER_ATTESTATION_NOT_VERIFIED");
  if (input.permit.chainId !== input.targetChainId) throw new Error("PERMIT_TARGET_CHAIN_MISMATCH");
  if (input.safeAddress.toLowerCase() !== input.permitSafeAddress.toLowerCase()) throw new Error("SAFE_IDENTITY_MISMATCH");
  if (input.executionBundleHash.toLowerCase() !== input.permitExecutionBundleHash.toLowerCase()) throw new Error("EXECUTION_BUNDLE_MISMATCH");
  if (input.nowOnTargetChain >= Date.parse(input.permit.expiresAt) / 1000) throw new Error("PERMIT_EXPIRED_ON_TARGET_CHAIN");
}
