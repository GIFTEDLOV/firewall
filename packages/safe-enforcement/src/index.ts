import { encodeAbiParameters, keccak256, type Hex } from "viem";

export type SafePermitAuthorization = {
  permitId: Hex; mandateId: Hex; executionId: Hex; proposalHash: Hex; executionBundleHash: Hex; targetChainId: bigint; safe: `0x${string}`; to: `0x${string}`; value: bigint; dataHash: Hex; operation: 0 | 1; safeNonce: bigint; targetsDigest: Hex; valuesDigest: Hex; calldataDigest: Hex; codeFactsDigest: Hex; implementationFactsDigest: Hex; targetCodeHash: Hex; implementationAddress: `0x${string}`; implementationCodeHash: Hex; batchStructureHash: Hex; adjudicationId: Hex; adjudicationGeneration: bigint; expiresAt: bigint; canonicalPermitHash: Hex;
};

export const SAFE_GUARD_TYPES = {
  PermitAuthorization: [
    { name: "permitId", type: "bytes32" }, { name: "mandateId", type: "bytes32" }, { name: "executionId", type: "bytes32" }, { name: "proposalHash", type: "bytes32" }, { name: "executionBundleHash", type: "bytes32" }, { name: "targetChainId", type: "uint256" }, { name: "safe", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "dataHash", type: "bytes32" }, { name: "operation", type: "uint8" }, { name: "safeNonce", type: "uint256" }, { name: "targetsDigest", type: "bytes32" }, { name: "valuesDigest", type: "bytes32" }, { name: "calldataDigest", type: "bytes32" }, { name: "codeFactsDigest", type: "bytes32" }, { name: "implementationFactsDigest", type: "bytes32" }, { name: "targetCodeHash", type: "bytes32" }, { name: "implementationAddress", type: "address" }, { name: "implementationCodeHash", type: "bytes32" }, { name: "batchStructureHash", type: "bytes32" }, { name: "adjudicationId", type: "bytes32" }, { name: "adjudicationGeneration", type: "uint256" }, { name: "expiresAt", type: "uint256" }, { name: "canonicalPermitHash", type: "bytes32" },
  ],
} as const;

export function safeGuardDomain(chainId: bigint | number, guard: `0x${string}`) { return { name: "FirewallSafeGuard", version: "1", chainId, verifyingContract: guard } as const; }
export function safeGuardTypedData(chainId: bigint | number, guard: `0x${string}`, message: SafePermitAuthorization) { return { domain: safeGuardDomain(chainId, guard), types: SAFE_GUARD_TYPES, primaryType: "PermitAuthorization" as const, message }; }

/** Must match the Solidity guard's nonce-bound lookup key exactly. */
export function safeGuardExecutionKey(input: Pick<SafePermitAuthorization, "targetChainId" | "safe" | "to" | "value" | "dataHash" | "operation" | "safeNonce">): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint8" }, { type: "uint256" }], [input.targetChainId, input.safe, input.to, input.value, input.dataHash, input.operation, input.safeNonce]));
}

export function assertExactSafeCall(input: Pick<SafePermitAuthorization, "targetChainId" | "safe" | "to" | "value" | "dataHash" | "operation" | "safeNonce">, call: { chainId: bigint | number; safe: `0x${string}`; to: `0x${string}`; value: bigint; dataHash: Hex; operation: 0 | 1; safeNonce: bigint }): void {
  if (BigInt(call.chainId) !== input.targetChainId || call.safe.toLowerCase() !== input.safe.toLowerCase() || call.to.toLowerCase() !== input.to.toLowerCase() || call.value !== input.value || call.dataHash.toLowerCase() !== input.dataHash.toLowerCase() || call.operation !== input.operation || call.safeNonce !== input.safeNonce) throw new Error("SAFE_CALL_AUTHORIZATION_MISMATCH");
}
