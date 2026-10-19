import { concatHex, hashTypedData, keccak256, recoverAddress, toHex, type Abi, type Hex } from "viem";
import { ProposalIdentitySchema, type GovernanceSystem, type ProposalIdentity } from "@firewall/domain";
import { hashCanonical, hashUtf8, type CanonicalValue } from "@firewall/shared";

export type GovernanceProvenance = "GOVERNANCE_AUTHENTICATED" | "SAFE_AUTHENTICATED" | "GOVERNANCE_UNVERIFIED" | "SAFE_UNVERIFIED" | "MANUAL_UNVERIFIED";
export type ImportedProposal = ProposalIdentity & { readonly proposalText: string; readonly proposalTextBytes: number; readonly provenance: GovernanceProvenance };
export interface GovernanceAdapter<TInput> { readonly system: GovernanceSystem; normalize(input: TInput): ImportedProposal; }
function proposalTextFields(text: string) { return { proposalTextSha256: hashUtf8(text), proposalTextBytes: new TextEncoder().encode(text).byteLength }; }

export type ManualCanonicalProposalInput = ProposalIdentity & { readonly proposalText: string };
export class ManualCanonicalAdapter implements GovernanceAdapter<ManualCanonicalProposalInput> {
  readonly system = "MANUAL_CANONICAL" as const;
  normalize(input: ManualCanonicalProposalInput): ImportedProposal {
    const { proposalText, ...identityInput } = input; const fields = proposalTextFields(proposalText);
    if (identityInput.proposalTextBytes !== fields.proposalTextBytes || identityInput.proposalTextSha256.toLowerCase() !== fields.proposalTextSha256.toLowerCase()) throw new Error("MANUAL_PROPOSAL_CONTENT_BINDING_MISMATCH");
    const identity = ProposalIdentitySchema.parse(identityInput); return { ...identity, proposalText, proposalTextBytes: fields.proposalTextBytes, provenance: "MANUAL_UNVERIFIED" };
  }
}

export type OpenZeppelinGovernorProposalInput = { readonly chainId: number; readonly governor: `0x${string}`; readonly proposalId: string; readonly proposer?: `0x${string}`; readonly targets: readonly `0x${string}`[]; readonly values: readonly string[]; readonly calldatas: readonly `0x${string}`[]; readonly description: string; readonly descriptionHash?: `0x${string}`; readonly proposalState?: string; readonly proposalSource: string };
const GOVERNOR_HASH_PROPOSAL_ABI: Abi = [{ type: "function", name: "hashProposal", stateMutability: "pure", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "descriptionHash", type: "bytes32" }], outputs: [{ type: "uint256" }] }];
const GOVERNOR_STATE_ABI: Abi = [{ type: "function", name: "state", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "uint8" }] }];
function governorCanonical(input: OpenZeppelinGovernorProposalInput, descriptionHash: Hex) { return { governor: input.governor, proposalId: input.proposalId, targets: input.targets, values: input.values, calldatas: input.calldatas, descriptionHash }; }
export class OpenZeppelinGovernorAdapter implements GovernanceAdapter<OpenZeppelinGovernorProposalInput> {
  readonly system = "OPENZEPPELIN_GOVERNOR" as const;
  normalize(input: OpenZeppelinGovernorProposalInput): ImportedProposal {
    if (input.targets.length !== input.values.length || input.targets.length !== input.calldatas.length || input.targets.length === 0) throw new Error("GOVERNOR_ARRAY_LENGTH_MISMATCH");
    const descriptionHash = input.descriptionHash ?? keccak256(toHex(input.description));
    const identity = ProposalIdentitySchema.parse({ governanceSystem: this.system, governanceChainId: input.chainId, governanceContract: input.governor, proposalExternalId: input.proposalId, proposalHash: hashCanonical(governorCanonical(input, descriptionHash) as unknown as CanonicalValue), proposalSource: input.proposalSource, ...proposalTextFields(input.description) });
    return { ...identity, proposalText: input.description, proposalTextBytes: identity.proposalTextBytes, provenance: "GOVERNANCE_UNVERIFIED" };
  }
}

export type GovernanceReadClient = { getChainId(): Promise<number>; getCode(address: `0x${string}`): Promise<Hex>; readContract(input: { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] }): Promise<unknown> };
/** Authenticates against the governor contract, not against the imported description. */
export async function verifyGovernorProposal(input: OpenZeppelinGovernorProposalInput, rpc: GovernanceReadClient): Promise<ImportedProposal> {
  const normalized = new OpenZeppelinGovernorAdapter().normalize(input);
  if (await rpc.getChainId() !== input.chainId) throw new Error("GOVERNOR_CHAIN_ID_MISMATCH");
  if ((await rpc.getCode(input.governor)) === "0x") throw new Error("GOVERNOR_CONTRACT_HAS_NO_CODE");
  const descriptionHash = input.descriptionHash ?? keccak256(toHex(input.description));
  if (descriptionHash.toLowerCase() !== keccak256(toHex(input.description)).toLowerCase()) throw new Error("GOVERNOR_DESCRIPTION_HASH_MISMATCH");
  const onChainId = await rpc.readContract({ address: input.governor, abi: GOVERNOR_HASH_PROPOSAL_ABI, functionName: "hashProposal", args: [input.targets, input.values, input.calldatas, descriptionHash] });
  if (BigInt(onChainId as bigint | string | number) !== BigInt(input.proposalId)) throw new Error("GOVERNOR_PROPOSAL_ID_MISMATCH");
  // A hashProposal call alone only proves the arithmetic identity. Read the
  // Governor's canonical state as well so a fabricated external proposal ID
  // or description cannot be promoted by the adapter.
  const state = await rpc.readContract({ address: input.governor, abi: GOVERNOR_STATE_ABI, functionName: "state", args: [BigInt(input.proposalId)] });
  if (input.proposalState !== undefined && String(state) !== input.proposalState) throw new Error("GOVERNOR_STATE_MISMATCH");
  return { ...normalized, provenance: "GOVERNANCE_AUTHENTICATED" };
}

export type SafeTransaction = { readonly to: `0x${string}`; readonly value: string; readonly data: `0x${string}`; readonly operation: 0 | 1; readonly nonce: number; readonly safeTxGas?: string; readonly baseGas?: string; readonly gasPrice?: string; readonly gasToken?: `0x${string}`; readonly refundReceiver?: `0x${string}`; readonly signatures?: readonly Hex[] };
export type SafeTransactionBundleInput = { readonly chainId: number; readonly safe: `0x${string}`; readonly externalId: string; readonly transactions: readonly SafeTransaction[]; readonly proposalSource: string; readonly proposalText?: string };
export type NormalizedSafeBundle = { readonly safe: `0x${string}`; readonly chainId: number; readonly transactions: readonly SafeTransaction[]; readonly safeTransactionHash: `0x${string}`; readonly safeTransactionHashAlgorithm: "SAFE_EIP712" | "SAFE_EIP712_BUNDLE" };
export const SAFE_TX_TYPES = { SafeTx: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "nonce", type: "uint256" }] } as const;
export function safeTransactionHashFor(chainId: number, safe: `0x${string}`, tx: SafeTransaction): Hex { return hashTypedData({ domain: { chainId, verifyingContract: safe }, types: SAFE_TX_TYPES, primaryType: "SafeTx", message: { to: tx.to, value: BigInt(tx.value), data: tx.data, operation: tx.operation, safeTxGas: BigInt(tx.safeTxGas ?? "0"), baseGas: BigInt(tx.baseGas ?? "0"), gasPrice: BigInt(tx.gasPrice ?? "0"), gasToken: tx.gasToken ?? "0x0000000000000000000000000000000000000000", refundReceiver: tx.refundReceiver ?? "0x0000000000000000000000000000000000000000", nonce: BigInt(tx.nonce) } }); }
export function normalizeSafeBundle(input: SafeTransactionBundleInput): NormalizedSafeBundle {
  if (input.transactions.length === 0) throw new Error("SAFE_BUNDLE_EMPTY");
  const hashes = input.transactions.map((tx) => safeTransactionHashFor(input.chainId, input.safe, tx));
  return { safe: input.safe, chainId: input.chainId, transactions: input.transactions, safeTransactionHash: hashes.length === 1 ? hashes[0]! : keccak256(concatHex(hashes)), safeTransactionHashAlgorithm: hashes.length === 1 ? "SAFE_EIP712" : "SAFE_EIP712_BUNDLE" };
}
export class SafeAdapter implements GovernanceAdapter<SafeTransactionBundleInput> {
  readonly system = "SAFE" as const;
  normalize(input: SafeTransactionBundleInput): ImportedProposal { const bundle = normalizeSafeBundle(input); const proposalText = input.proposalText ?? `Safe transaction bundle ${input.externalId}`; const identity = ProposalIdentitySchema.parse({ governanceSystem: this.system, governanceChainId: input.chainId, governanceContract: input.safe, proposalExternalId: input.externalId, proposalHash: bundle.safeTransactionHash, proposalSource: input.proposalSource, ...proposalTextFields(proposalText) }); return { ...identity, proposalText, proposalTextBytes: identity.proposalTextBytes, provenance: "SAFE_UNVERIFIED" }; }
}
export type SafeVerificationReader = GovernanceReadClient & { getSafeNonce(safe: `0x${string}`): Promise<number>; getSafeOwners(safe: `0x${string}`): Promise<readonly `0x${string}`[]>; getSafeThreshold(safe: `0x${string}`): Promise<number> };
/** Authenticates Safe identity/chain/nonce/code against an RPC reader. */
export async function verifySafeTransactionBundle(input: SafeTransactionBundleInput, rpc: SafeVerificationReader): Promise<ImportedProposal> {
  const normalized = new SafeAdapter().normalize(input);
  if (await rpc.getChainId() !== input.chainId) throw new Error("SAFE_CHAIN_ID_MISMATCH");
  if ((await rpc.getCode(input.safe)) === "0x") throw new Error("SAFE_CONTRACT_HAS_NO_CODE");
  const actualNonce = await rpc.getSafeNonce(input.safe);
  if (input.transactions[0]?.nonce !== actualNonce) throw new Error("SAFE_NONCE_MISMATCH");
  for (let index = 1; index < input.transactions.length; index += 1) if (input.transactions[index]!.nonce !== input.transactions[index - 1]!.nonce + 1) throw new Error("SAFE_NONCE_ORDER_MISMATCH");
  const owners = new Set((await rpc.getSafeOwners(input.safe)).map((owner) => owner.toLowerCase()));
  const threshold = await rpc.getSafeThreshold(input.safe);
  if (threshold < 1 || owners.size < threshold) throw new Error("SAFE_THRESHOLD_INVALID");
  for (const transaction of input.transactions) {
    if (!transaction.signatures || transaction.signatures.length < threshold) throw new Error("SAFE_CONFIRMATION_EVIDENCE_REQUIRED");
    const signedOwners = new Set<string>();
    for (const signature of transaction.signatures) {
      try {
        const signer = await recoverAddress({ hash: safeTransactionHashFor(input.chainId, input.safe, transaction), signature });
        if (!owners.has(signer.toLowerCase()) || signedOwners.has(signer.toLowerCase())) throw new Error("SAFE_SIGNATURE_NOT_AUTHORIZED");
        signedOwners.add(signer.toLowerCase());
      } catch { throw new Error("SAFE_SIGNATURE_INVALID"); }
    }
    if (signedOwners.size < threshold) throw new Error("SAFE_THRESHOLD_NOT_MET");
  }
  return { ...normalized, provenance: "SAFE_AUTHENTICATED" };
}

/** Decodes the standard Safe MultiSend(bytes) payload when the byte layout is valid. */
export function decodeMultiSend(data: `0x${string}`): SafeTransaction[] {
  const multiSendSelector = "8d80ff0a"; if (!data.toLowerCase().startsWith(`0x${multiSendSelector}`)) return [];
  const body = data.slice(10); const result: SafeTransaction[] = []; let offset = 0;
  while (offset < body.length) {
    if (body.length - offset < 170) throw new Error("SAFE_MULTISEND_MALFORMED");
    const operation = Number.parseInt(body.slice(offset, offset + 2), 16); const to = `0x${body.slice(offset + 2, offset + 42)}` as `0x${string}`; const value = BigInt(`0x${body.slice(offset + 42, offset + 106)}`).toString(10); const length = Number(BigInt(`0x${body.slice(offset + 106, offset + 170)}`));
    const dataStart = offset + 170; const dataEnd = dataStart + length * 2;
    if ((operation !== 0 && operation !== 1) || dataEnd > body.length) throw new Error("SAFE_MULTISEND_MALFORMED");
    result.push({ operation: operation as 0 | 1, to, value, data: `0x${body.slice(dataStart, dataEnd)}`, nonce: result.length }); offset = dataEnd;
  }
  return result;
}
