import type { Address } from "viem";

/** The relay signer must be independently held from Safe owner authority. */
export function isDistinctSafeRelaySigner(relaySigner: Address, safeOwners: readonly Address[]): boolean {
  return !safeOwners.some((owner) => owner.toLowerCase() === relaySigner.toLowerCase());
}
