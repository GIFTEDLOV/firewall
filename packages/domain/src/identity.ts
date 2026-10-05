import { hashCanonical, type CanonicalValue } from "@firewall/shared";
import type { Adjudication, EvidenceBundle, ExecutionPackage, Mandate, Permit, ProposalIdentity } from "./schemas.js";

export function proposalIdentityHash(proposal: ProposalIdentity): `0x${string}` {
  return hashCanonical(proposal as unknown as CanonicalValue);
}

export function mandateIdentityHash(mandate: Pick<Mandate, "governanceSystem" | "governanceChainId" | "governanceContract" | "proposalExternalId" | "proposalHash" | "proposalSource" | "proposalTextSha256" | "proposalTextBytes" | "mandateVersion" | "constraints">): `0x${string}` {
  return hashCanonical({
    governanceSystem: mandate.governanceSystem,
    governanceChainId: mandate.governanceChainId,
    governanceContract: mandate.governanceContract,
    proposalExternalId: mandate.proposalExternalId,
    proposalHash: mandate.proposalHash,
    proposalSource: mandate.proposalSource,
    proposalTextSha256: mandate.proposalTextSha256,
    proposalTextBytes: mandate.proposalTextBytes,
    mandateVersion: mandate.mandateVersion,
    constraints: mandate.constraints,
  } as unknown as CanonicalValue);
}

export function executionBundleHash(execution: Pick<ExecutionPackage, "mandateId" | "chainId" | "targets" | "operations">): `0x${string}` {
  return hashCanonical({
    mandateId: execution.mandateId,
    chainId: execution.chainId,
    targets: execution.targets,
    operations: execution.operations,
  } as unknown as CanonicalValue);
}

export function evidenceBundleHash(evidence: Pick<EvidenceBundle, "mandateId" | "executionId" | "proposalIdentityHash" | "entries" | "schemaVersion">): `0x${string}` {
  return hashCanonical(evidence as unknown as CanonicalValue);
}

export function adjudicationBindingHash(adjudication: Pick<Adjudication, "mandateId" | "executionId" | "evidenceId" | "adjudicationGeneration" | "semanticSchema" | "result" | "verdict">): `0x${string}` {
  return hashCanonical(adjudication as unknown as CanonicalValue);
}

export function permitBindingHash(permit: Pick<Permit, "mandateId" | "mandateVersion" | "proposalHash" | "executionId" | "executionBundleHash" | "chainId" | "targetAddresses" | "calldataValueDigest" | "targetCodeHashes" | "implementationHashes" | "adjudicationId" | "adjudicationGeneration" | "semanticSchema" | "issuedAt" | "expiresAt">): `0x${string}` {
  return hashCanonical(permit as unknown as CanonicalValue);
}
