import { ProposalIdentitySchema, type ProposalIdentity, type GovernanceSystem } from "@firewall/domain";
import { hashUtf8 } from "@firewall/shared";

export type ImportedProposal = ProposalIdentity & {
  readonly proposalText: string;
  readonly proposalTextBytes: number;
};

export interface GovernanceAdapter<TInput> {
  readonly system: GovernanceSystem;
  normalize(input: TInput): ImportedProposal;
}

export type ManualCanonicalProposalInput = ProposalIdentity & { readonly proposalText: string };

export class ManualCanonicalAdapter implements GovernanceAdapter<ManualCanonicalProposalInput> {
  readonly system = "MANUAL_CANONICAL" as const;

  normalize(input: ManualCanonicalProposalInput): ImportedProposal {
    const { proposalText, ...identityInput } = input;
    const expectedBytes = new TextEncoder().encode(proposalText).byteLength;
    if (identityInput.proposalTextBytes !== expectedBytes) throw new Error("PROPOSAL_TEXT_BYTE_LENGTH_MISMATCH");
    const identity = ProposalIdentitySchema.parse(identityInput);
    const proposalTextBytes = expectedBytes;
    return { ...identity, proposalText, proposalTextBytes };
  }
}

export type OpenZeppelinGovernorProposalInput = {
  readonly chainId: number;
  readonly governor: `0x${string}`;
  readonly proposalId: string;
  readonly proposalHash: `0x${string}`;
  readonly proposalSource: string;
  readonly proposalText: string;
};

export class OpenZeppelinGovernorAdapter implements GovernanceAdapter<OpenZeppelinGovernorProposalInput> {
  readonly system = "OPENZEPPELIN_GOVERNOR" as const;

  normalize(input: OpenZeppelinGovernorProposalInput): ImportedProposal {
    const proposalTextBytes = new TextEncoder().encode(input.proposalText).byteLength;
    const identity = ProposalIdentitySchema.parse({
      governanceSystem: this.system,
      governanceChainId: input.chainId,
      governanceContract: input.governor,
      proposalExternalId: input.proposalId,
      proposalHash: input.proposalHash,
      proposalSource: input.proposalSource,
      proposalTextSha256: hashUtf8(input.proposalText),
      proposalTextBytes,
    });
    return { ...identity, proposalText: input.proposalText, proposalTextBytes };
  }
}

export type SafeTransactionBundleInput = {
  readonly chainId: number;
  readonly safe: `0x${string}`;
  readonly externalId: string;
  readonly proposalHash: `0x${string}`;
  readonly proposalSource: string;
  readonly proposalText: string;
};

export class SafeAdapter implements GovernanceAdapter<SafeTransactionBundleInput> {
  readonly system = "SAFE" as const;

  normalize(input: SafeTransactionBundleInput): ImportedProposal {
    const proposalTextBytes = new TextEncoder().encode(input.proposalText).byteLength;
    const identity = ProposalIdentitySchema.parse({
      governanceSystem: this.system,
      governanceChainId: input.chainId,
      governanceContract: input.safe,
      proposalExternalId: input.externalId,
      proposalHash: input.proposalHash,
      proposalSource: input.proposalSource,
      proposalTextSha256: hashUtf8(input.proposalText),
      proposalTextBytes,
    });
    return { ...identity, proposalText: input.proposalText, proposalTextBytes };
  }
}
