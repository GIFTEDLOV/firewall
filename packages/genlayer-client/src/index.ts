import type { Adjudication, EvidenceBundle, ExecutionPackage, Mandate, Permit } from "@firewall/domain";

export type TransactionStage = "PREPARING" | "AWAITING_WALLET" | "BROADCAST" | "PENDING" | "ACCEPTED" | "FINALIZED" | "EXECUTION_FAILED" | "CANONICAL_SUCCESS";

export type PersistedTransaction = {
  readonly hash: `0x${string}`;
  readonly stage: TransactionStage;
  readonly method: string;
  readonly chainId: number;
  readonly submittedAt: string;
};

export interface GenLayerReadClient {
  readMandate(id: string): Promise<Mandate | null>;
  readExecution(id: string): Promise<ExecutionPackage | null>;
  readAdjudication(id: string): Promise<Adjudication | null>;
  readPermit(id: string): Promise<Permit | null>;
}

export interface GenLayerWriteClient extends GenLayerReadClient {
  prepareMandate(input: Omit<Mandate, "mandateId" | "mandateIdentityHash" | "state" | "frozenAt">): Promise<unknown>;
  commitExecution(input: Omit<ExecutionPackage, "executionId" | "bundleHash" | "calldataValueDigest" | "state">): Promise<unknown>;
  authenticateEvidence(input: EvidenceBundle): Promise<unknown>;
  recordAdjudication(input: Adjudication): Promise<unknown>;
  issuePermit(input: Permit): Promise<unknown>;
}

export type TransactionReconciliation = {
  readonly preconditionReadHash: string;
  readonly preparedCallHash: string;
  readonly broadcastHash: string | null;
  readonly reconciledHash: string | null;
  readonly finalityObserved: boolean;
  readonly executionResultChecked: boolean;
  readonly canonicalReadback: boolean;
};

/** The protocol write sequence is intentionally explicit so callers cannot hide rebroadcasts. */
export function assertSafeTransactionLifecycle(state: TransactionReconciliation): void {
  if (state.broadcastHash !== null && state.broadcastHash !== state.preparedCallHash) throw new Error("BROADCAST_HASH_MISMATCH");
  if (state.reconciledHash !== null && state.reconciledHash !== state.broadcastHash) throw new Error("RECONCILIATION_HASH_MISMATCH");
  if (state.canonicalReadback && !state.executionResultChecked) throw new Error("READBACK_BEFORE_EXECUTION_RESULT_CHECK");
}
