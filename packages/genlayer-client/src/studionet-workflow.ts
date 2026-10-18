import { abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import { encodeFunctionData, type Abi, type Address } from "viem";
import { CANONICAL_CHAIN_ID, CANONICAL_CONTRACT_ADDRESS, CANONICAL_RPC_URL, CANONICAL_SOURCE_SHA256, createCanonicalReader } from "./canonical-reader.js";

export type FirewallV2WriteMethod =
  | "create_mandate"
  | "freeze_mandate"
  | "commit_execution"
  | "authenticate_evidence"
  | "adjudicate_execution"
  | "issue_permit";

export type Eip1193Provider = {
  request(input: { readonly method: string; readonly params?: readonly unknown[] | Record<string, unknown> }): Promise<unknown>;
};

export type StudionetWalletSession = {
  readonly client: ReturnType<typeof createClient>;
  readonly address: Address;
  readonly canonicalReadReady: boolean;
  readonly canonicalReadError: string | null;
  setSubmissionHashHandler?: (handler: (hash: `0x${string}`) => void) => void;
};

export type ZeroFeeWritePreflight = {
  readonly chainId: number;
  readonly method: FirewallV2WriteMethod;
  readonly sender: Address;
  readonly contract: Address;
  readonly valueWei: "0";
  readonly estimatedGas: string;
  readonly gasPriceWei: "0";
  readonly estimatedFeeWei: "0";
  readonly balanceWei: string;
  readonly senderNonce: string;
  readonly protocolFeeMode: "STABLE_STUDIONET_NONPAYABLE_NO_FEE_MANAGER";
};

const chain = studionet as unknown as Exclude<NonNullable<Parameters<typeof createClient>[0]>["chain"], undefined>;

/** Connects the injected wallet to GenLayer Studionet, then verifies V2 read readiness. */
export async function connectFirewallStudionetWallet(provider: Eip1193Provider): Promise<StudionetWalletSession> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])) throw new Error("GENLAYER_WALLET_ACCOUNT_UNAVAILABLE");
  const address = accounts[0] as Address;
  let submissionHashHandler: (hash: `0x${string}`) => void = () => undefined;
  const trackedProvider: Eip1193Provider = {
    async request(input) {
      const result = await provider.request(input);
      if ((input.method === "eth_sendTransaction" || input.method === "eth_sendRawTransaction") && typeof result === "string" && /^0x[0-9a-f]{64}$/i.test(result)) {
        submissionHashHandler(result as `0x${string}`);
      }
      return result;
    },
  };
  const client = createClient({ chain, endpoint: CANONICAL_RPC_URL, account: address, provider: trackedProvider as never });
  await client.connect("studionet");
  const walletChainId = await provider.request({ method: "eth_chainId" });
  if (typeof walletChainId !== "string" || Number.parseInt(walletChainId, 16) !== CANONICAL_CHAIN_ID) throw new Error("GENLAYER_WALLET_CHAIN_MISMATCH");
  try {
  const reader = createCanonicalReader({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL, expectedSourceSha256: CANONICAL_SOURCE_SHA256 }, client);
    await reader.read();
    return { client, address, canonicalReadReady: true, canonicalReadError: null, setSubmissionHashHandler: (handler) => { submissionHashHandler = handler; } };
  } catch {
    return { client, address, canonicalReadReady: false, canonicalReadError: "CANONICAL_V2_READ_UNAVAILABLE", setSubmissionHashHandler: (handler) => { submissionHashHandler = handler; } };
  }
}

/** Uses the exact stable SDK addTransaction ABI path and rejects any nonzero fee quote. */
export async function preflightFirewallV2Write(session: StudionetWalletSession, method: FirewallV2WriteMethod, args: readonly unknown[]): Promise<ZeroFeeWritePreflight> {
  if (!session.canonicalReadReady) throw new Error("CANONICAL_V2_READ_UNAVAILABLE");
  const [chainId, gasPriceResult, balanceWei, latestNonce, pendingNonce] = await Promise.all([
    session.client.getChainId(),
    session.client.request({ method: "eth_gasPrice" }),
    session.client.getBalance({ address: session.address }),
    session.client.getTransactionCount({ address: session.address, blockTag: "latest" }),
    session.client.getTransactionCount({ address: session.address, blockTag: "pending" }),
  ]);
  if (chainId !== CANONICAL_CHAIN_ID || typeof gasPriceResult !== "string" || BigInt(latestNonce) !== BigInt(pendingNonce)) throw new Error("STUDIONET_FEE_OR_NONCE_PREFLIGHT_UNAVAILABLE");
  const gasPrice = BigInt(gasPriceResult);
  const consensus = session.client.chain.consensusMainContract;
  if (!consensus?.address || !consensus.abi) throw new Error("CONSENSUS_CONTRACT_CONFIGURATION_MISSING");
  const feeManager = (session.client.chain as unknown as { feeManagerContract?: unknown }).feeManagerContract;
  const addTransaction = (consensus.abi as readonly { readonly type?: string; readonly name?: string; readonly stateMutability?: string; readonly inputs?: readonly unknown[] }[])
    .find((item) => item.type === "function" && item.name === "addTransaction");
  if (feeManager || addTransaction?.stateMutability !== "nonpayable" || addTransaction.inputs?.length !== 5) {
    throw new Error("STUDIONET_PROTOCOL_FEE_MODE_UNVERIFIED");
  }
  const innerPayload = abi.transactions.serialize([abi.calldata.encode(abi.calldata.makeCalldataObject(method, [...args] as never[], undefined)), false]);
  const consensusAbi = consensus.abi as Abi;
  const inputCount = addTransaction.inputs.length;
  const addTransactionArgs = [session.address, CANONICAL_CONTRACT_ADDRESS, session.client.chain.defaultNumberOfInitialValidators, session.client.chain.defaultConsensusMaxRotations, innerPayload];
  const data = encodeFunctionData({
    abi: consensusAbi,
    functionName: "addTransaction",
    args: addTransactionArgs as never,
  });
  const estimatedGas = await session.client.estimateTransactionGas({ from: session.address, to: consensus.address, data, value: 0n });
  const estimatedFee = estimatedGas * gasPrice;
  if (gasPrice !== 0n || estimatedFee !== 0n) throw new Error("NONZERO_GENLAYER_FEE_OUTSIDE_ZERO_SPEND_AUTHORIZATION");
  return { chainId, method, sender: session.address, contract: CANONICAL_CONTRACT_ADDRESS, valueWei: "0", estimatedGas: estimatedGas.toString(), gasPriceWei: "0", estimatedFeeWei: "0", balanceWei: balanceWei.toString(), senderNonce: BigInt(latestNonce).toString(), protocolFeeMode: "STABLE_STUDIONET_NONPAYABLE_NO_FEE_MANAGER" };
}

/**
 * Sends one explicitly keyed V2 operation and waits for finalized consensus.
 * A canonical readback callback is mandatory before the result is reported as
 * successful. The caller must persist the returned hash and never rebroadcast
 * the same operation after an uncertain result.
 */
export async function submitFirewallV2Write(input: {
  readonly session: StudionetWalletSession;
  readonly method: FirewallV2WriteMethod;
  readonly args: readonly unknown[];
  readonly operationKey: string;
  readonly canonicalPostcondition: () => Promise<boolean>;
}): Promise<{ readonly hash: `0x${string}`; readonly postcondition: true; readonly preflight: ZeroFeeWritePreflight }> {
  if (!input.session.canonicalReadReady) throw new Error("CANONICAL_V2_READ_UNAVAILABLE");
  if (typeof window === "undefined") throw new Error("BROWSER_WALLET_REQUIRED");
  if (!input.operationKey || !/^[a-zA-Z0-9:_-]{1,180}$/.test(input.operationKey)) throw new Error("OPERATION_KEY_INVALID");
  const preflight = await preflightFirewallV2Write(input.session, input.method, input.args);
  const key = `firewall.studionet.write.${input.session.address.toLowerCase()}.${input.operationKey}`;
  if (window.localStorage.getItem(key)) throw new Error("DUPLICATE_BROADCAST_BLOCKED_CHECK_EXISTING_OPERATION");
  const baseRecord = { operationKey: input.operationKey, method: input.method, stage: "AWAITING_WALLET", chainId: CANONICAL_CHAIN_ID, contract: CANONICAL_CONTRACT_ADDRESS, sender: input.session.address, senderNonce: preflight.senderNonce, createdAt: new Date().toISOString(), hash: null as string | null, protocolTransactionId: null as string | null, argumentsSha256: await sha256Hex(stableJson(input.args)) };
  window.localStorage.setItem(key, JSON.stringify(baseRecord));
  input.session.setSubmissionHashHandler?.((hash) => {
    const current = JSON.parse(window.localStorage.getItem(key) ?? "null") as typeof baseRecord | null;
    if (!current) throw new Error("DURABLE_SUBMISSION_INTENT_MISSING");
    if (current.hash && current.hash.toLowerCase() !== hash.toLowerCase()) throw new Error("DURABLE_SUBMISSION_HASH_CONFLICT");
    window.localStorage.setItem(key, JSON.stringify({ ...current, stage: "SUBMITTED_EVM_PENDING", hash, protocolTransactionId: hash, submissionHashPersistedAt: new Date().toISOString() }));
  });
  let hash: TransactionHash;
  try {
    hash = await input.session.client.writeContract({ address: CANONICAL_CONTRACT_ADDRESS, functionName: input.method, args: input.args as never[], value: 0n }) as TransactionHash;
  } catch {
    input.session.setSubmissionHashHandler?.(() => undefined);
    // Do not erase the journal: an interrupted provider can leave broadcast
    // status uncertain, so a second send under this key remains blocked.
    const current = JSON.parse(window.localStorage.getItem(key) ?? "null") as typeof baseRecord | null;
    window.localStorage.setItem(key, JSON.stringify({ ...baseRecord, ...current, stage: current?.hash ? "OUTCOME_UNCERTAIN_TRACK_SAVED_HASH" : "OUTCOME_UNCERTAIN_NO_HASH_DO_NOT_RETRY" }));
    throw new Error("WRITE_OUTCOME_UNCERTAIN_RECONCILE_WALLET_AND_CHAIN_BEFORE_RETRY");
  }
  input.session.setSubmissionHashHandler?.(() => undefined);
  const saved = JSON.parse(window.localStorage.getItem(key) ?? "null") as typeof baseRecord | null;
  if (saved?.hash && saved.hash.toLowerCase() !== hash.toLowerCase()) throw new Error("SDK_AND_PERSISTED_SUBMISSION_HASH_MISMATCH");
  window.localStorage.setItem(key, JSON.stringify({ ...baseRecord, ...saved, stage: "GENLAYER_CONSENSUS_PENDING", hash, protocolTransactionId: hash }));
  const finalized = await waitForFirewallV2Finality(input.session, key, hash);
  if (!(await input.canonicalPostcondition())) throw new Error("FINALIZED_WRITE_CANONICAL_POSTCONDITION_NOT_CONFIRMED");
  window.localStorage.setItem(key, JSON.stringify({ ...baseRecord, ...saved, stage: "CANONICAL_SUCCESS", hash, protocolTransactionId: hash, status: finalized.statusName, consensus: normalizedConsensusResult(finalized), execution: normalizedExecutionResult(finalized), canonicalPostcondition: "CONFIRMED" }));
  return { hash, postcondition: true, preflight };
}

function stableJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return `0x${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", source)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizedConsensusResult(receipt: { readonly resultName?: string; readonly result_name?: string }): string {
  return receipt.resultName ?? receipt.result_name ?? "UNKNOWN";
}

function normalizedExecutionResult(receipt: { readonly txExecutionResultName?: string; readonly consensus_data?: unknown }): string {
  if (receipt.txExecutionResultName) return receipt.txExecutionResultName;
  const data = typeof receipt.consensus_data === "object" && receipt.consensus_data !== null ? receipt.consensus_data as Record<string, unknown> : {};
  const leaders = Array.isArray(data.leader_receipt) ? data.leader_receipt : [];
  if (leaders.some((value) => {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Record<string, unknown>;
    return item.mode === "leader" && item.execution_result === "SUCCESS" && item.result === "return";
  })) return "FINISHED_WITH_RETURN";
  if (leaders.some((value) => typeof value === "object" && value !== null && (value as Record<string, unknown>).mode === "leader" && (value as Record<string, unknown>).execution_result === "ERROR")) return "FINISHED_WITH_ERROR";
  return "UNKNOWN";
}

async function waitForFirewallV2Finality(session: StudionetWalletSession, key: string, hash: `0x${string}`) {
  let interval = 5_000;
  for (;;) {
    try {
      const [outerReceipt, finalized] = await Promise.all([
        session.client.request({ method: "eth_getTransactionReceipt", params: [hash] }) as Promise<Record<string, unknown> | null>,
        session.client.getTransaction({ hash: hash as TransactionHash }),
      ]);
      const record = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      const consensus = normalizedConsensusResult(finalized);
      const execution = normalizedExecutionResult(finalized as never);
      const status = finalized.statusName ?? "UNKNOWN";
      if (outerReceipt && typeof outerReceipt.gasUsed === "string" && typeof outerReceipt.effectiveGasPrice === "string") {
        const actualFeeWei = BigInt(outerReceipt.gasUsed) * BigInt(outerReceipt.effectiveGasPrice);
        if (actualFeeWei !== 0n || (typeof outerReceipt.status === "string" && BigInt(outerReceipt.status) !== 1n)) {
          window.localStorage.setItem(key, JSON.stringify({ ...record, stage: "OUTER_EVM_FAILED_STOP", actualFeeWei: actualFeeWei.toString() }));
          throw new Error("OUTER_EVM_RECEIPT_FAILED_OR_NONZERO_FEE");
        }
        record.actualFeeWei = actualFeeWei.toString();
      }
      window.localStorage.setItem(key, JSON.stringify({ ...record, stage: status === "ACCEPTED" ? "GENLAYER_ACCEPTED_APPEALABLE" : status === "FINALIZED" ? "GENLAYER_FINALIZED" : "GENLAYER_CONSENSUS_PENDING", hash, protocolTransactionId: hash, status, consensus, execution, lastPollAt: new Date().toISOString() }));
      if (status === "FINALIZED") {
        if (consensus !== "MAJORITY_AGREE" || execution !== "FINISHED_WITH_RETURN") {
          window.localStorage.setItem(key, JSON.stringify({ ...record, stage: "FINALIZED_CONSENSUS_OR_EXECUTION_REJECTED", hash, protocolTransactionId: hash, status, consensus, execution }));
          throw new Error("GENLAYER_CONSENSUS_OR_EXECUTION_REJECTED");
        }
        return finalized;
      }
      if (status === "CANCELED") throw new Error("GENLAYER_TRANSACTION_CANCELED");
      interval = 5_000;
    } catch (error) {
      if (error instanceof Error && ["OUTER_EVM_RECEIPT_FAILED_OR_NONZERO_FEE", "GENLAYER_CONSENSUS_OR_EXECUTION_REJECTED", "GENLAYER_TRANSACTION_CANCELED"].includes(error.message)) throw error;
      const record = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      window.localStorage.setItem(key, JSON.stringify({ ...record, stage: "FINALITY_STATUS_UNAVAILABLE_TRACK_SAME_HASH", lastPollAt: new Date().toISOString(), lastPollError: "RPC_READ_FAILED" }));
      interval = Math.min(30_000, Math.floor(interval * 1.5));
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export type RecoverableStudionetWrite = {
  readonly key: string;
  readonly operationKey: string;
  readonly method: FirewallV2WriteMethod;
  readonly stage: string;
  readonly hash: `0x${string}` | null;
};

/** Lists persisted operations for the connected account; it never submits a transaction. */
export function listRecoverableStudionetWrites(address: Address): readonly RecoverableStudionetWrite[] {
  if (typeof window === "undefined") return [];
  const prefix = `firewall.studionet.write.${address.toLowerCase()}.`;
  const records: RecoverableStudionetWrite[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const record = JSON.parse(window.localStorage.getItem(key) ?? "null") as Record<string, unknown> | null;
      if (!record || typeof record.method !== "string" || !["create_mandate", "freeze_mandate", "commit_execution", "authenticate_evidence", "adjudicate_execution", "issue_permit"].includes(record.method)) continue;
      if (["CANONICAL_SUCCESS", "FINALIZED_CONSENSUS_OR_EXECUTION_REJECTED", "OUTER_EVM_FAILED_STOP"].includes(String(record.stage))) continue;
      const hash = typeof record.hash === "string" && /^0x[0-9a-f]{64}$/i.test(record.hash) ? record.hash as `0x${string}` : null;
      records.push({ key, operationKey: typeof record.operationKey === "string" ? record.operationKey : key.slice(prefix.length), method: record.method as FirewallV2WriteMethod, stage: typeof record.stage === "string" ? record.stage : "UNKNOWN", hash });
    } catch { /* Ignore malformed local records. */ }
  }
  return records.sort((left, right) => left.key.localeCompare(right.key));
}

/** Resumes status tracking for a saved hash and verifies canonical postconditions; never rebroadcasts. */
export async function resumeFirewallV2Write(input: {
  readonly session: StudionetWalletSession;
  readonly operationKey: string;
  readonly canonicalPostcondition: () => Promise<boolean>;
}): Promise<{ readonly hash: `0x${string}`; readonly postcondition: true }> {
  if (!input.session.canonicalReadReady || typeof window === "undefined") throw new Error("CANONICAL_V2_READ_UNAVAILABLE");
  const key = `firewall.studionet.write.${input.session.address.toLowerCase()}.${input.operationKey}`;
  const record = JSON.parse(window.localStorage.getItem(key) ?? "null") as Record<string, unknown> | null;
  if (!record || record.chainId !== CANONICAL_CHAIN_ID || typeof record.contract !== "string" || record.contract.toLowerCase() !== CANONICAL_CONTRACT_ADDRESS.toLowerCase() || typeof record.sender !== "string" || record.sender.toLowerCase() !== input.session.address.toLowerCase()) throw new Error("SAVED_OPERATION_NETWORK_OR_SIGNER_MISMATCH");
  if (typeof record.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(record.hash)) throw new Error("SAVED_OPERATION_HAS_NO_SUBMISSION_HASH_DO_NOT_RETRY");
  const hash = record.hash as `0x${string}`;
  const finalized = await waitForFirewallV2Finality(input.session, key, hash);
  if (!(await input.canonicalPostcondition())) {
    window.localStorage.setItem(key, JSON.stringify({ ...record, stage: "FINALIZED_AWAITING_CANONICAL_READBACK", hash, status: finalized.statusName, consensus: normalizedConsensusResult(finalized), execution: normalizedExecutionResult(finalized) }));
    throw new Error("FINALIZED_WRITE_CANONICAL_POSTCONDITION_NOT_CONFIRMED");
  }
  window.localStorage.setItem(key, JSON.stringify({ ...record, stage: "CANONICAL_SUCCESS", hash, protocolTransactionId: hash, status: finalized.statusName, consensus: normalizedConsensusResult(finalized), execution: normalizedExecutionResult(finalized), canonicalPostcondition: "CONFIRMED" }));
  return { hash, postcondition: true };
}
