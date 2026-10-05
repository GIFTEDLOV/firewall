import { ProposalIdentitySchema, type GovernanceSystem, type ProposalIdentity } from "@firewall/domain";
import { hashCanonical, hashUtf8, type CanonicalValue } from "@firewall/shared";

export type ImportedProposal = ProposalIdentity & {
  readonly proposalText: string;
  readonly proposalTextBytes: number;
  readonly provenance: "GOVERNANCE_AUTHENTICATED" | "SAFE_AUTHENTICATED" | "MANUAL_UNVERIFIED";
};

export interface GovernanceAdapter<TInput> {
  readonly system: GovernanceSystem;
  normalize(input: TInput): ImportedProposal;
}

function proposalTextFields(text: string) {
  return { proposalTextSha256: hashUtf8(text), proposalTextBytes: new TextEncoder().encode(text).byteLength };
}

export type ManualCanonicalProposalInput = ProposalIdentity & { readonly proposalText: string };

export class ManualCanonicalAdapter implements GovernanceAdapter<ManualCanonicalProposalInput> {
  readonly system = "MANUAL_CANONICAL" as const;
  normalize(input: ManualCanonicalProposalInput): ImportedProposal {
    const { proposalText, ...identityInput } = input;
    const fields = proposalTextFields(proposalText);
    if (identityInput.proposalTextBytes !== fields.proposalTextBytes || identityInput.proposalTextSha256.toLowerCase() !== fields.proposalTextSha256.toLowerCase()) {
      throw new Error("MANUAL_PROPOSAL_CONTENT_BINDING_MISMATCH");
    }
    const identity = ProposalIdentitySchema.parse(identityInput);
    return { ...identity, proposalText, proposalTextBytes: fields.proposalTextBytes, provenance: "MANUAL_UNVERIFIED" };
  }
}

export type OpenZeppelinGovernorProposalInput = {
  readonly chainId: number;
  readonly governor: `0x${string}`;
  readonly proposalId: string;
  readonly proposer?: `0x${string}`;
  readonly targets: readonly `0x${string}`[];
  readonly values: readonly string[];
  readonly calldatas: readonly `0x${string}`[];
  readonly description: string;
  readonly descriptionHash?: `0x${string}`;
  readonly proposalState?: string;
  readonly proposalSource: string;
};

export class OpenZeppelinGovernorAdapter implements GovernanceAdapter<OpenZeppelinGovernorProposalInput> {
  readonly system = "OPENZEPPELIN_GOVERNOR" as const;
  normalize(input: OpenZeppelinGovernorProposalInput): ImportedProposal {
    if (input.targets.length !== input.values.length || input.targets.length !== input.calldatas.length || input.targets.length === 0) throw new Error("GOVERNOR_ARRAY_LENGTH_MISMATCH");
    const canonical = { governor: input.governor, proposalId: input.proposalId, targets: input.targets, values: input.values, calldatas: input.calldatas, descriptionHash: input.descriptionHash ?? hashUtf8(input.description) };
    const identity = ProposalIdentitySchema.parse({
      governanceSystem: this.system,
      governanceChainId: input.chainId,
      governanceContract: input.governor,
      proposalExternalId: input.proposalId,
      proposalHash: hashCanonical(canonical as unknown as CanonicalValue),
      proposalSource: input.proposalSource,
      ...proposalTextFields(input.description),
    });
    return { ...identity, proposalText: input.description, proposalTextBytes: identity.proposalTextBytes, provenance: "GOVERNANCE_AUTHENTICATED" };
  }
}

export type SafeTransaction = {
  readonly to: `0x${string}`;
  readonly value: string;
  readonly data: `0x${string}`;
  readonly operation: 0 | 1;
  readonly nonce: number;
};

export type SafeTransactionBundleInput = {
  readonly chainId: number;
  readonly safe: `0x${string}`;
  readonly externalId: string;
  readonly transactions: readonly SafeTransaction[];
  readonly proposalSource: string;
  readonly proposalText?: string;
};

export type NormalizedSafeBundle = {
  readonly safe: `0x${string}`;
  readonly chainId: number;
  readonly transactions: readonly SafeTransaction[];
  readonly safeTransactionHash: `0x${string}`;
};

export function normalizeSafeBundle(input: SafeTransactionBundleInput): NormalizedSafeBundle {
  if (input.transactions.length === 0) throw new Error("SAFE_BUNDLE_EMPTY");
  return { safe: input.safe, chainId: input.chainId, transactions: input.transactions, safeTransactionHash: hashCanonical({ safe: input.safe, chainId: input.chainId, transactions: input.transactions } as unknown as CanonicalValue) };
}

export class SafeAdapter implements GovernanceAdapter<SafeTransactionBundleInput> {
  readonly system = "SAFE" as const;
  normalize(input: SafeTransactionBundleInput): ImportedProposal {
    const bundle = normalizeSafeBundle(input);
    const proposalText = input.proposalText ?? `Safe transaction bundle ${input.externalId}`;
    const identity = ProposalIdentitySchema.parse({
      governanceSystem: this.system,
      governanceChainId: input.chainId,
      governanceContract: input.safe,
      proposalExternalId: input.externalId,
      proposalHash: bundle.safeTransactionHash,
      proposalSource: input.proposalSource,
      ...proposalTextFields(proposalText),
    });
    return { ...identity, proposalText, proposalTextBytes: identity.proposalTextBytes, provenance: "SAFE_AUTHENTICATED" };
  }
}

/** Decodes the standard Safe MultiSend(bytes) payload when the byte layout is valid. */
export function decodeMultiSend(data: `0x${string}`): SafeTransaction[] {
  const multiSendSelector = "8d80ff0a";
  if (!data.toLowerCase().startsWith(`0x${multiSendSelector}`)) return [];
  const body = data.slice(10);
  const result: SafeTransaction[] = [];
  let offset = 0;
  while (offset < body.length) {
    if (body.length - offset < 2 + 40 + 64 + 64) throw new Error("SAFE_MULTISEND_MALFORMED");
    const operation = Number.parseInt(body.slice(offset, offset + 2), 16);
    const to = `0x${body.slice(offset + 2, offset + 42)}` as `0x${string}`;
    const value = BigInt(`0x${body.slice(offset + 42, offset + 106)}`).toString(10);
    const length = Number(BigInt(`0x${body.slice(offset + 106, offset + 170)}`));
    const dataStart = offset + 170;
    const dataEnd = dataStart + length * 2;
    if ((operation !== 0 && operation !== 1) || dataEnd > body.length) throw new Error("SAFE_MULTISEND_MALFORMED");
    result.push({ operation: operation as 0 | 1, to, value, data: `0x${body.slice(dataStart, dataEnd)}`, nonce: result.length });
    offset = dataEnd;
  }
  return result;
}
