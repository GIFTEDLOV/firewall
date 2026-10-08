import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Adjudication, EvidenceBundle, ExecutionPackage, Mandate, Permit } from "@firewall/domain";

export * from "./canonical-reader";

export type TransactionStage = "PREPARING" | "AWAITING_WALLET" | "BROADCAST" | "PENDING" | "ACCEPTED" | "FINALIZED" | "EXECUTION_FAILED" | "CANONICAL_SUCCESS";

export type PersistedTransaction = {
  readonly operation: string;
  readonly contract: `0x${string}` | string;
  readonly hash: `0x${string}` | null;
  readonly stage: TransactionStage;
  readonly method: string;
  readonly chainId: number;
  readonly argsHash: string;
  readonly sender: `0x${string}` | string;
  readonly nonce?: string;
  readonly submittedAt: string;
  readonly lastObservedStatus?: string;
  readonly executionResult?: "SUCCESS" | "ERROR" | null;
  readonly canonicalPostcondition?: string | null;
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
  adjudicateExecution(executionId: string): Promise<unknown>;
  issuePermit(input: Pick<Permit, "executionId" | "adjudicationId">): Promise<unknown>;
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

const TERMINAL_STAGES = new Set<TransactionStage>(["CANONICAL_SUCCESS", "EXECUTION_FAILED"]);
const ALLOWED_TRANSITIONS: Record<TransactionStage, readonly TransactionStage[]> = {
  PREPARING: ["AWAITING_WALLET"],
  AWAITING_WALLET: ["BROADCAST"],
  BROADCAST: ["PENDING"],
  PENDING: ["ACCEPTED", "FINALIZED", "EXECUTION_FAILED"],
  ACCEPTED: ["FINALIZED", "EXECUTION_FAILED"],
  FINALIZED: ["CANONICAL_SUCCESS", "EXECUTION_FAILED"],
  EXECUTION_FAILED: [],
  CANONICAL_SUCCESS: [],
};

export interface TransactionJournalStore {
  get(id: string): PersistedTransaction | null;
  put(id: string, transaction: PersistedTransaction): void;
}

export class InMemoryTransactionJournalStore implements TransactionJournalStore {
  private readonly values = new Map<string, PersistedTransaction>();
  get(id: string): PersistedTransaction | null { return this.values.get(id) ?? null; }
  put(id: string, transaction: PersistedTransaction): void { this.values.set(id, transaction); }
}

export class FileTransactionJournalStore implements TransactionJournalStore {
  private readonly values: Map<string, PersistedTransaction>;
  constructor(private readonly filePath: string) {
    if (!existsSync(filePath)) this.values = new Map();
    else this.values = new Map(Object.entries(JSON.parse(readFileSync(filePath, "utf8")) as Record<string, PersistedTransaction>));
  }
  get(id: string): PersistedTransaction | null { return this.values.get(id) ?? null; }
  put(id: string, transaction: PersistedTransaction): void {
    this.values.set(id, transaction);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(Object.fromEntries(this.values), null, 2), "utf8");
  }
}

export class CrashSafeTransactionJournal {
  constructor(private readonly store: TransactionJournalStore) {}

  prepare(id: string, transaction: Omit<PersistedTransaction, "stage">): PersistedTransaction {
    if (this.store.get(id)) throw new Error("TRANSACTION_ALREADY_PREPARED");
    const value = { ...transaction, stage: "PREPARING" as const };
    this.store.put(id, value);
    return value;
  }

  transition(id: string, next: TransactionStage, patch: Partial<PersistedTransaction> = {}): PersistedTransaction {
    const current = this.store.get(id);
    if (!current) throw new Error("TRANSACTION_NOT_FOUND");
    if (TERMINAL_STAGES.has(current.stage)) throw new Error("TRANSACTION_TERMINAL");
    if (!ALLOWED_TRANSITIONS[current.stage].includes(next)) throw new Error(`INVALID_TRANSACTION_TRANSITION:${current.stage}:${next}`);
    if (next === "CANONICAL_SUCCESS" && (patch.executionResult ?? current.executionResult) !== "SUCCESS") throw new Error("CANONICAL_SUCCESS_REQUIRES_EXECUTION_SUCCESS");
    if (next === "CANONICAL_SUCCESS" && !(patch.canonicalPostcondition ?? current.canonicalPostcondition)) throw new Error("CANONICAL_SUCCESS_REQUIRES_READBACK");
    if (current.hash && patch.hash && current.hash !== patch.hash) throw new Error("TRANSACTION_HASH_REPLACEMENT");
    const value = { ...current, ...patch, stage: next };
    this.store.put(id, value);
    return value;
  }

  recordBroadcast(id: string, hash: `0x${string}`): PersistedTransaction {
    const current = this.store.get(id);
    if (!current) throw new Error("TRANSACTION_NOT_FOUND");
    if (current.hash && current.hash !== hash) throw new Error("TRANSACTION_HASH_REPLACEMENT");
    if (current.hash === hash) return current;
    return this.transition(id, "BROADCAST", { hash });
  }

  recover(id: string): PersistedTransaction {
    const value = this.store.get(id);
    if (!value) throw new Error("TRANSACTION_NOT_FOUND");
    return value;
  }
}
