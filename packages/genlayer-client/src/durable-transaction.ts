import type { GenLayerTransaction } from "genlayer-js/types";
import { decodeEventLog, type Hex } from "viem";
import { resolveFirewallGenLayerNetwork, type FirewallGenLayerNetworkAlias } from "./network-config.js";

export type DurableSubmissionStage =
  | "PREPARED"
  | "OUTER_EVM_SUBMISSION_UNKNOWN"
  | "OUTER_EVM_SUBMITTED"
  | "OUTER_EVM_FAILED"
  | "GENLAYER_CONSENSUS_PENDING"
  | "GENLAYER_ACCEPTED_APPEALABLE"
  | "GENLAYER_FINALIZED_SUCCESS"
  | "GENLAYER_FINALIZED_CONSENSUS_REJECTED"
  | "GENLAYER_FINALIZED_EXECUTION_FAILED"
  | "GENLAYER_CANCELED"
  | "CANONICAL_READBACK_CONFIRMED"
  | "CANONICAL_READBACK_MISMATCH";

export type DurableTransactionRecord = {
  readonly schema: "FIREWALL_DURABLE_GENLAYER_TRANSACTION_V1";
  readonly operationKey: string;
  readonly network: FirewallGenLayerNetworkAlias;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly contract: Hex;
  readonly sender: Hex;
  readonly senderNonce: string | null;
  readonly method: string;
  readonly argumentsSha256: Hex;
  estimatedEvmFeeWei: string | null;
  estimatedGenLayerFeeWei: string | null;
  feeEstimateSource: string | null;
  readonly createdAt: string;
  updatedAt: string;
  stage: DurableSubmissionStage;
  /** Outer GenLayer Chain EVM transaction hash and receipt. */
  evmSubmissionHash: Hex | null;
  evmReceipt: Record<string, unknown> | null;
  evmFeeWei: string | null;
  evmStatus: "NOT_SUBMITTED" | "UNKNOWN" | "PENDING" | "MINED_SUCCESS" | "MINED_REVERTED";
  /** Protocol transaction id emitted by the consensus contract. */
  genlayerTxId: Hex | null;
  consensusStatus: string | null;
  consensusResult: string | null;
  projectedStatus: string | null;
  resolutionAction: string | null;
  resolutionSource: string | null;
  decisionId: string | null;
  decisionActive: boolean | null;
  executionResult: string | null;
  consensusTransaction: Record<string, unknown> | null;
  consensusReceipt: Record<string, unknown> | null;
  feeAccounting: Record<string, unknown> | null;
  refundAccounting: unknown;
  finalityObservedAt: string | null;
  canonicalReadback: "NOT_CHECKED" | "CONFIRMED" | "MISMATCH";
  canonicalReadbackEvidence: Record<string, unknown> | null;
  lastPollAt: string | null;
  lastPollError: string | null;
};

export interface DurableTransactionStore {
  get(operationKey: string): Promise<DurableTransactionRecord | null>;
  put(record: DurableTransactionRecord): Promise<void>;
  list(): Promise<readonly DurableTransactionRecord[]>;
}

export type TrackedEip1193Provider = {
  request(input: { readonly method: string; readonly params?: readonly unknown[] | Record<string, unknown> }): Promise<unknown>;
};

/** Capture the outer EVM hash before control returns to GenLayerJS. */
export function createTrackedEip1193Provider(
  provider: TrackedEip1193Provider,
  onSubmissionHash: (hash: Hex) => Promise<void>,
): TrackedEip1193Provider {
  return {
    async request(input) {
      const result = await provider.request(input);
      if ((input.method === "eth_sendTransaction" || input.method === "eth_sendRawTransaction") && typeof result === "string" && /^0x[0-9a-f]{64}$/i.test(result)) {
        await onSubmissionHash(result as Hex);
      }
      return result;
    },
  };
}

export function createBrowserDurableTransactionStore(prefix = "firewall.genlayer.transaction."): DurableTransactionStore {
  if (typeof window === "undefined") throw new Error("BROWSER_TRANSACTION_STORE_UNAVAILABLE");
  const readAll = (): DurableTransactionRecord[] => {
    const records: DurableTransactionRecord[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        records.push(JSON.parse(window.localStorage.getItem(key) ?? "null") as DurableTransactionRecord);
      } catch {
        // Keep malformed local entries out of the recovery index.
      }
    }
    return records.filter((record) => record?.schema === "FIREWALL_DURABLE_GENLAYER_TRANSACTION_V1");
  };
  return {
    async get(operationKey) {
      const raw = window.localStorage.getItem(`${prefix}${operationKey}`);
      if (!raw) return null;
      try {
        const record = JSON.parse(raw) as DurableTransactionRecord;
        return record.schema === "FIREWALL_DURABLE_GENLAYER_TRANSACTION_V1" ? record : null;
      } catch {
        return null;
      }
    },
    async put(record) {
      const next = { ...record, updatedAt: new Date().toISOString() };
      window.localStorage.setItem(`${prefix}${record.operationKey}`, JSON.stringify(next));
    },
    async list() { return readAll(); },
  };
}

export function newDurableTransactionRecord(input: {
  readonly operationKey: string;
  readonly network: FirewallGenLayerNetworkAlias;
  readonly contract: Hex;
  readonly sender: Hex;
  readonly senderNonce: bigint | null;
  readonly method: string;
  readonly argumentsSha256: Hex;
}): DurableTransactionRecord {
  const network = resolveFirewallGenLayerNetwork(input.network);
  const createdAt = new Date().toISOString();
  return {
    schema: "FIREWALL_DURABLE_GENLAYER_TRANSACTION_V1",
    operationKey: input.operationKey,
    network: network.alias,
    chainId: network.chainId,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
    contract: input.contract,
    sender: input.sender,
    senderNonce: input.senderNonce?.toString() ?? null,
    method: input.method,
    argumentsSha256: input.argumentsSha256,
    estimatedEvmFeeWei: null,
    estimatedGenLayerFeeWei: null,
    feeEstimateSource: null,
    createdAt,
    updatedAt: createdAt,
    stage: "PREPARED",
    evmSubmissionHash: null,
    evmReceipt: null,
    evmFeeWei: null,
    evmStatus: "NOT_SUBMITTED",
    genlayerTxId: null,
    consensusStatus: null,
    consensusResult: null,
    projectedStatus: null,
    resolutionAction: null,
    resolutionSource: null,
    decisionId: null,
    decisionActive: null,
    executionResult: null,
    consensusTransaction: null,
    consensusReceipt: null,
    feeAccounting: null,
    refundAccounting: null,
    finalityObservedAt: null,
    canonicalReadback: "NOT_CHECKED",
    canonicalReadbackEvidence: null,
    lastPollAt: null,
    lastPollError: null,
  };
}

export async function recordEvmSubmissionHash(
  store: DurableTransactionStore,
  operationKey: string,
  hash: Hex,
): Promise<void> {
  const record = await store.get(operationKey);
  if (!record) throw new Error("DURABLE_TRANSACTION_RECORD_MISSING_BEFORE_BROADCAST");
  if (record.evmSubmissionHash && record.evmSubmissionHash.toLowerCase() !== hash.toLowerCase()) throw new Error("DURABLE_TRANSACTION_OUTER_HASH_CONFLICT");
  record.evmSubmissionHash = hash;
  record.evmStatus = "PENDING";
  record.stage = "OUTER_EVM_SUBMITTED";
  await store.put(record);
}

export async function recordGenLayerTransactionId(
  store: DurableTransactionStore,
  operationKey: string,
  txId: Hex,
): Promise<void> {
  const record = await store.get(operationKey);
  if (!record) throw new Error("DURABLE_TRANSACTION_RECORD_MISSING_AFTER_BROADCAST");
  if (record.genlayerTxId && record.genlayerTxId.toLowerCase() !== txId.toLowerCase()) throw new Error("DURABLE_TRANSACTION_PROTOCOL_ID_CONFLICT");
  record.genlayerTxId = txId;
  record.stage = "GENLAYER_CONSENSUS_PENDING";
  await store.put(record);
}

type ReadClient = {
  readonly chain: {
    readonly consensusMainContract: { readonly address: Hex; readonly abi: readonly unknown[] } | null;
  };
  request(args: unknown): Promise<unknown>;
  getTransaction(args: { readonly hash: Hex }): Promise<GenLayerTransaction>;
  advanced?: { getTransactionLifecycle(args: { readonly hash: Hex }): Promise<{
    readonly storedStatus: string;
    readonly projectedStatus: string;
    readonly resolutionAction: string;
    readonly resolutionSource: string;
    readonly decisionId: string | null;
    readonly decisionActive: boolean;
    readonly evaluatedAt: number;
  }> };
};

function recordObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizedConsensusResult(transaction: GenLayerTransaction): string | null {
  const raw = transaction as unknown as Record<string, unknown>;
  const value = transaction.resultName ?? raw.result_name;
  return typeof value === "string" ? value : null;
}

function normalizedExecutionResult(transaction: GenLayerTransaction): string | null {
  if (transaction.txExecutionResultName) return String(transaction.txExecutionResultName);
  const raw = transaction as unknown as Record<string, unknown>;
  const data = recordObject(raw.consensus_data);
  const receipts = Array.isArray(data?.leader_receipt) ? data.leader_receipt : [];
  if (receipts.some((value) => {
    const item = recordObject(value);
    const result = recordObject(item?.result);
    return item?.execution_result === "SUCCESS" && (item.result === "return" || result?.status === "return");
  })) return "FINISHED_WITH_RETURN";
  if (receipts.some((value) => {
    const item = recordObject(value);
    return item?.mode === "leader" && item?.execution_result === "ERROR";
  })) return "FINISHED_WITH_ERROR";
  return null;
}

function successfulFinalizedWrite(transaction: GenLayerTransaction): boolean {
  return transaction.statusName === "FINALIZED"
    && normalizedConsensusResult(transaction) === "MAJORITY_AGREE"
    && normalizedExecutionResult(transaction) === "FINISHED_WITH_RETURN";
}

function safeTransactionSummary(transaction: GenLayerTransaction): Record<string, unknown> {
  const raw = transaction as unknown as Record<string, unknown>;
  const consensus = recordObject(raw.consensus_data);
  const leaders = Array.isArray(consensus?.leader_receipt) ? consensus.leader_receipt : [];
  const lastRound = recordObject(raw.last_round) ?? recordObject(raw.lastRound);
  return {
    status: transaction.statusName ?? null,
    consensus: normalizedConsensusResult(transaction),
    execution: normalizedExecutionResult(transaction),
    appeals: raw.appealed ?? null,
    appealFailed: raw.appeal_failed ?? null,
    appealUndetermined: raw.appeal_undetermined ?? null,
    rounds: raw.num_of_rounds ?? raw.numOfRounds ?? null,
    lastRound: lastRound ? Object.fromEntries(["round", "leader_index", "votes_committed", "votes_revealed", "rotations_left", "validator_votes_name"].filter((key) => lastRound[key] !== undefined).map((key) => [key, lastRound[key]])) : null,
    leaderReceipts: leaders.map((value) => {
      const item = recordObject(value);
      const result = recordObject(item?.result);
      return item ? { mode: item.mode ?? null, execution_result: item.execution_result ?? null, result_status: result?.status ?? null } : null;
    }),
  };
}

function hex(value: unknown): Hex | null {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value) ? value as Hex : null;
}

function findCreatedTransactionId(receipt: Record<string, unknown>, client: ReadClient): Hex | null {
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const abi = client.chain.consensusMainContract?.abi;
  const consensusAddress = client.chain.consensusMainContract?.address.toLowerCase();
  if (!abi || !consensusAddress) return null;
  for (const value of logs) {
    const log = recordObject(value);
    if (!log || typeof log.address !== "string" || log.address.toLowerCase() !== consensusAddress) continue;
    if (!Array.isArray(log.topics) || typeof log.data !== "string") continue;
    try {
      const topics = log.topics as Hex[];
      if (!topics.length) continue;
      const decoded = decodeEventLog({ abi: abi as never, data: log.data as Hex, topics: topics as [Hex, ...Hex[]] });
      if (decoded.eventName !== "CreatedTransaction") continue;
      const args = decoded.args as unknown as Record<string, unknown>;
      const txId = hex(args.txId);
      if (txId) return txId;
    } catch {
      // Unrelated consensus log.
    }
  }
  return null;
}

async function refreshEvmReceipt(record: DurableTransactionRecord, client: ReadClient, store: DurableTransactionStore): Promise<void> {
  if (!record.evmSubmissionHash) return;
  const value = await client.request({ method: "eth_getTransactionReceipt", params: [record.evmSubmissionHash] } as never);
  const receipt = recordObject(value);
  if (!receipt) return;
  record.evmReceipt = receipt;
  const txStatus = typeof receipt.status === "string" ? BigInt(receipt.status) : null;
  record.evmStatus = txStatus === null ? "UNKNOWN" : txStatus === 0n ? "MINED_REVERTED" : "MINED_SUCCESS";
  if (typeof receipt.gasUsed === "string" && typeof receipt.effectiveGasPrice === "string") {
    record.evmFeeWei = (BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)).toString();
  }
  if (!record.genlayerTxId && txStatus === 1n) {
    const discovered = findCreatedTransactionId(receipt, client);
    if (discovered) record.genlayerTxId = discovered;
  }
  await store.put(record);
}

/** Polls the same transaction indefinitely; accepted, decided, appealed and transient RPC states remain resumable. */
export async function resumeDurableTransaction(input: {
  readonly operationKey: string;
  readonly store: DurableTransactionStore;
  readonly client: ReadClient;
  readonly signal?: AbortSignal;
  readonly onUpdate?: (record: DurableTransactionRecord) => void;
  readonly canonicalReadback?: () => Promise<{ readonly status: "CONFIRMED" | "MISMATCH"; readonly evidence: Record<string, unknown> }>;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}): Promise<DurableTransactionRecord> {
  const delay = input.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let waitMs = 5_000;
  for (;;) {
    if (input.signal?.aborted) throw new Error("DURABLE_TRANSACTION_TRACKING_PAUSED");
    const record = await input.store.get(input.operationKey);
    if (!record) throw new Error("DURABLE_TRANSACTION_RECORD_NOT_FOUND");
    try {
      await refreshEvmReceipt(record, input.client, input.store);
      if (record.evmStatus === "MINED_REVERTED") {
        record.stage = "OUTER_EVM_FAILED";
        record.lastPollAt = new Date().toISOString();
        await input.store.put(record);
        input.onUpdate?.(record);
        return record;
      }
      if (!record.genlayerTxId) {
        record.lastPollAt = new Date().toISOString();
        record.lastPollError = record.evmSubmissionHash ? "AWAITING_CREATED_TRANSACTION_EVENT" : "AWAITING_OUTER_EVM_SUBMISSION_HASH";
        await input.store.put(record);
        input.onUpdate?.(record);
        await delay(waitMs);
        waitMs = Math.min(waitMs * 1.5, 30_000);
        continue;
      }

      const [transaction, lifecycle] = await Promise.all([
        input.client.getTransaction({ hash: record.genlayerTxId }),
        input.client.advanced?.getTransactionLifecycle({ hash: record.genlayerTxId }).catch(() => null) ?? Promise.resolve(null),
      ]);
      record.consensusStatus = transaction.statusName ? String(transaction.statusName) : null;
      record.consensusResult = normalizedConsensusResult(transaction);
      record.projectedStatus = lifecycle?.projectedStatus ?? record.consensusStatus;
      record.resolutionAction = lifecycle?.resolutionAction ?? null;
      record.resolutionSource = lifecycle?.resolutionSource ?? "GENLAYER_STATUS_ENDPOINT";
      record.decisionId = lifecycle?.decisionId ?? null;
      record.decisionActive = lifecycle?.decisionActive ?? null;
      record.executionResult = normalizedExecutionResult(transaction);
      // Allowlist status and execution fields. Raw validator receipts include
      // node_config material and must never be persisted by the application.
      const transactionData = transaction as unknown as Record<string, unknown>;
      record.consensusTransaction = safeTransactionSummary(transaction);
      record.consensusReceipt = typeof transaction.txReceipt === "string" ? { txReceipt: transaction.txReceipt } : null;
      const fees = recordObject(transactionData.fees) ?? recordObject(transactionData.feeAccounting);
      record.feeAccounting = fees ? Object.fromEntries(Object.entries(fees).filter(([key, value]) => /^(?:fee|gas|price|charged|used|amount)(?:_|$)/i.test(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"))) : null;
      record.refundAccounting = { status: "NOT_EXPOSED_IN_GENLAYER_TRANSACTION_RESPONSE" };
      record.lastPollAt = new Date().toISOString();
      record.lastPollError = null;

      const status = String(transaction.statusName ?? "").toUpperCase();
      if (status === "FINALIZED") {
        record.finalityObservedAt = record.finalityObservedAt ?? new Date().toISOString();
        if (record.consensusResult !== "MAJORITY_AGREE") record.stage = "GENLAYER_FINALIZED_CONSENSUS_REJECTED";
        else record.stage = successfulFinalizedWrite(transaction) ? "GENLAYER_FINALIZED_SUCCESS" : "GENLAYER_FINALIZED_EXECUTION_FAILED";
        if (record.stage === "GENLAYER_FINALIZED_SUCCESS" && input.canonicalReadback) {
          const readback = await input.canonicalReadback();
          record.canonicalReadback = readback.status;
          record.canonicalReadbackEvidence = readback.evidence;
          record.stage = readback.status === "CONFIRMED" ? "CANONICAL_READBACK_CONFIRMED" : "CANONICAL_READBACK_MISMATCH";
        }
        await input.store.put(record);
        input.onUpdate?.(record);
        return record;
      }
      if (status === "CANCELED") {
        record.stage = "GENLAYER_CANCELED";
        await input.store.put(record);
        input.onUpdate?.(record);
        return record;
      }
      else if (status === "ACCEPTED") record.stage = "GENLAYER_ACCEPTED_APPEALABLE";
      else record.stage = "GENLAYER_CONSENSUS_PENDING";
      await input.store.put(record);
      input.onUpdate?.(record);
      waitMs = 5_000;
    } catch (error) {
      record.lastPollAt = new Date().toISOString();
      // SDK/RPC errors can contain validator diagnostics. Persist only a safe
      // generic marker rather than arbitrary response text.
      record.lastPollError = "RPC_READ_FAILED";
      await input.store.put(record);
      input.onUpdate?.(record);
      waitMs = Math.min(waitMs * 1.5, 30_000);
    }
    await delay(waitMs);
  }
}
