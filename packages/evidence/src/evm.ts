import { keccak256, type Hex } from "viem";
import { hashCanonical, type CanonicalValue } from "@firewall/shared";
import type { EvidenceStatus } from "./index.js";

export const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
export const EIP1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;

export type RpcSource = { readonly name: string; readonly url: string; request<T>(method: string, params: readonly unknown[]): Promise<T> };

export function httpRpcSource(name: string, url: string, fetcher: typeof fetch = fetch): RpcSource {
  return { name, url, async request<T>(method: string, params: readonly unknown[]) {
    const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
    const body = await response.json() as { result?: T; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? "RPC_ERROR");
    if (!("result" in body)) throw new Error("RPC_RESULT_MISSING");
    return body.result as T;
  } };
}

type RpcBlock = { number: Hex; hash: Hex; timestamp: Hex; parentHash: Hex };
type RpcTransaction = { hash: Hex; from: `0x${string}`; to: `0x${string}` | null; input: Hex; value: Hex; nonce: Hex; blockHash: Hex | null; blockNumber: Hex | null };
type RpcReceipt = { transactionHash: Hex; blockHash: Hex; blockNumber: Hex; status: "0x0" | "0x1"; logs: readonly { address: `0x${string}`; topics: readonly Hex[]; data: Hex; logIndex: Hex }[] };
type RpcLog = { address: `0x${string}`; topics: readonly Hex[]; data: Hex; blockHash: Hex; blockNumber: Hex; transactionHash: Hex; logIndex: Hex };

export type EvmTargetEvidenceRequest = { readonly address: `0x${string}`; readonly expectedCodeHash?: Hex; readonly expectedImplementationAddress?: `0x${string}` | null; readonly expectedImplementationCodeHash?: Hex | null };
export type EvmEvidenceRequest = {
  readonly chainId: number;
  readonly executionId: string;
  readonly governanceContract?: `0x${string}`;
  readonly transactionHash?: Hex;
  readonly expectedTransaction?: { readonly from?: `0x${string}`; readonly to: `0x${string}` | null; readonly value: string; readonly input: Hex; readonly nonce?: number };
  readonly targets: readonly EvmTargetEvidenceRequest[];
  readonly blockTag?: Hex;
  readonly finality?: "latest" | "safe" | "finalized" | "historical";
  readonly maxAgeSeconds?: number;
  readonly observedAt?: string;
  readonly logFilter?: { readonly address?: `0x${string}`; readonly topics?: readonly (Hex | null)[] };
};

export type EvmTargetEvidence = { readonly address: `0x${string}`; readonly code: Hex; readonly codeHash: Hex; readonly implementationAddress: `0x${string}` | null; readonly implementationCodeHash: Hex | null; readonly adminAddress: `0x${string}` | null };
export type EvmEvidence = {
  readonly status: "VERIFIED_PRE_EXECUTION" | "VERIFIED_POST_EXECUTION";
  readonly verificationStatus: "VERIFIED_PRE_EXECUTION" | "VERIFIED_POST_EXECUTION";
  readonly chainId: number;
  readonly executionId: string;
  readonly finalityAssumption: NonNullable<EvmEvidenceRequest["finality"]>;
  readonly primarySource: string;
  readonly secondarySource: string | null;
  readonly block: { readonly number: number; readonly hash: Hex; readonly parentHash: Hex; readonly timestamp: number };
  readonly transaction: { readonly hash: Hex; readonly from: `0x${string}`; readonly to: `0x${string}` | null; readonly input: Hex; readonly value: string; readonly nonce: number } | null;
  readonly receipt: { readonly transactionHash: Hex; readonly blockHash: Hex; readonly blockNumber: number; readonly status: "SUCCESS" | "FAILED"; readonly logs: readonly RpcReceipt["logs"][number][] } | null;
  readonly targets: readonly EvmTargetEvidence[];
  readonly logs: readonly RpcLog[];
  readonly evidenceHash: Hex;
  readonly capturedAt: string;
};
export type EvmVerificationFailure = { readonly status: Exclude<EvidenceStatus, "PENDING" | "UNVERIFIED" | "VERIFIED_PRE_EXECUTION" | "VERIFIED_POST_EXECUTION">; readonly reason: string; readonly primarySource: string; readonly secondarySource: string | null; readonly capturedAt: string };
export type EvmVerificationResult = { readonly ok: true; readonly evidence: EvmEvidence } | { readonly ok: false; readonly failure: EvmVerificationFailure };

function hexNumber(value: Hex | undefined, label: string): number { if (!value || !/^0x[0-9a-f]+$/i.test(value)) throw new Error(`RPC_FIELD_INVALID:${label}`); const parsed = Number(BigInt(value)); if (!Number.isSafeInteger(parsed)) throw new Error(`RPC_FIELD_UNSAFE:${label}`); return parsed; }
function normalizeAddress(value: string | null): `0x${string}` | null { return value ? value.toLowerCase() as `0x${string}` : null; }
function stable(value: unknown): string { return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item); }
function failure(status: EvmVerificationFailure["status"], reason: string, primary: RpcSource, secondary: RpcSource | null, capturedAt: string): EvmVerificationResult { return { ok: false, failure: { status, reason, primarySource: primary.name, secondarySource: secondary?.name ?? null, capturedAt } }; }
function sourceFailure(error: unknown, primary: RpcSource, secondary: RpcSource | null, capturedAt: string): EvmVerificationResult {
  const reason = error instanceof Error ? error.message : "RPC_SOURCE_FAILURE";
  const status: EvmVerificationFailure["status"] = reason === "CHAIN_ID_MISMATCH" || reason.includes("MISMATCH") && reason !== "TRANSACTION_BLOCK_MISMATCH" ? "EVIDENCE_MISMATCH" : reason === "TRANSACTION_BLOCK_MISMATCH" ? "REORG_DETECTED" : "SOURCE_UNAVAILABLE";
  return failure(status, reason, primary, secondary, capturedAt);
}

async function loadSource(source: RpcSource, request: EvmEvidenceRequest) {
  const chainId = hexNumber(await source.request<Hex>("eth_chainId", []), "chainId");
  if (chainId !== request.chainId) throw new Error("CHAIN_ID_MISMATCH");
  let transaction: RpcTransaction | null = null;
  let receipt: RpcReceipt | null = null;
  if (request.transactionHash) {
    transaction = await source.request<RpcTransaction | null>("eth_getTransactionByHash", [request.transactionHash]);
    if (!transaction) throw new Error("TRANSACTION_UNAVAILABLE");
    receipt = await source.request<RpcReceipt | null>("eth_getTransactionReceipt", [request.transactionHash]);
    if (!receipt) throw new Error("RECEIPT_UNAVAILABLE");
    if (transaction.hash.toLowerCase() !== request.transactionHash.toLowerCase() || receipt.transactionHash.toLowerCase() !== request.transactionHash.toLowerCase()) throw new Error("TRANSACTION_ID_MISMATCH");
  }
  const movingTag = request.finality === "safe" ? "safe" : request.finality === "finalized" ? "finalized" : "latest";
  // A post-execution receipt is anchored to its mined block by default. Using
  // the moving latest head here would reject every older, otherwise valid tx.
  const tag: Hex = request.blockTag ?? transaction?.blockNumber ?? movingTag as Hex;
  const block = await source.request<RpcBlock | null>("eth_getBlockByNumber", [tag, false]);
  if (!block) throw new Error("BLOCK_UNAVAILABLE");
  const blockNumber = hexNumber(block.number, "block.number");
  const blockTimestamp = hexNumber(block.timestamp, "block.timestamp");
  if (receipt && (receipt.blockHash.toLowerCase() !== block.hash.toLowerCase() || receipt.blockNumber.toLowerCase() !== block.number.toLowerCase() || transaction?.blockHash?.toLowerCase() !== block.hash.toLowerCase())) throw new Error("TRANSACTION_BLOCK_MISMATCH");
  const targets: EvmTargetEvidence[] = [];
  for (const target of request.targets) {
    const code = await source.request<Hex>("eth_getCode", [target.address, tag]);
    const codeHash = keccak256(code);
    const implementationWord = await source.request<Hex>("eth_getStorageAt", [target.address, EIP1967_IMPLEMENTATION_SLOT, tag]);
    const adminWord = await source.request<Hex>("eth_getStorageAt", [target.address, EIP1967_ADMIN_SLOT, tag]);
    const implementationAddress = implementationWord && BigInt(implementationWord) !== 0n ? `0x${implementationWord.slice(-40)}`.toLowerCase() as `0x${string}` : null;
    const adminAddress = adminWord && BigInt(adminWord) !== 0n ? `0x${adminWord.slice(-40)}`.toLowerCase() as `0x${string}` : null;
    const implementationCode = implementationAddress ? await source.request<Hex>("eth_getCode", [implementationAddress, tag]) : null;
    const implementationCodeHash = implementationCode ? keccak256(implementationCode) : null;
    if (target.expectedCodeHash && target.expectedCodeHash.toLowerCase() !== codeHash.toLowerCase()) throw new Error("TARGET_CODE_HASH_MISMATCH");
    if (target.expectedImplementationAddress !== undefined && (target.expectedImplementationAddress?.toLowerCase() ?? null) !== implementationAddress) throw new Error("IMPLEMENTATION_ADDRESS_MISMATCH");
    if (target.expectedImplementationCodeHash !== undefined && (target.expectedImplementationCodeHash?.toLowerCase() ?? null) !== (implementationCodeHash?.toLowerCase() ?? null)) throw new Error("IMPLEMENTATION_CODE_HASH_MISMATCH");
    targets.push({ address: target.address.toLowerCase() as `0x${string}`, code, codeHash, implementationAddress, implementationCodeHash, adminAddress });
  }
  const logs = request.logFilter ? await source.request<readonly RpcLog[]>("eth_getLogs", [{ ...request.logFilter, fromBlock: block.number, toBlock: block.number }]) : [];
  return { chainId, block: { number: blockNumber, hash: block.hash, parentHash: block.parentHash, timestamp: blockTimestamp }, transaction, receipt, targets, logs };
}

function transactionProjection(tx: RpcTransaction | null) { return tx ? { hash: tx.hash.toLowerCase(), from: tx.from.toLowerCase(), to: normalizeAddress(tx.to), input: tx.input.toLowerCase(), value: BigInt(tx.value).toString(10), nonce: hexNumber(tx.nonce, "transaction.nonce"), blockHash: tx.blockHash?.toLowerCase() ?? null, blockNumber: tx.blockNumber ? hexNumber(tx.blockNumber, "transaction.blockNumber") : null } : null; }

/** Fetches chain facts from one or two RPC sources and never upgrades a caller digest into authentication. */
export async function verifyEvmEvidence(request: EvmEvidenceRequest, primary: RpcSource, secondary?: RpcSource): Promise<EvmVerificationResult> {
  const capturedAt = request.observedAt ?? new Date().toISOString();
  if (!request.targets.length) return failure("INSUFFICIENT_EVIDENCE", "TARGETS_REQUIRED", primary, secondary ?? null, capturedAt);
  let first: Awaited<ReturnType<typeof loadSource>>;
  try { first = await loadSource(primary, request); } catch (error) { return sourceFailure(error, primary, secondary ?? null, capturedAt); }
  let second: Awaited<ReturnType<typeof loadSource>> | null = null;
  if (secondary) {
    try { second = await loadSource(secondary, request); } catch (error) { return sourceFailure(error instanceof Error ? new Error(`SECONDARY:${error.message}`) : "SECONDARY_SOURCE_UNAVAILABLE", primary, secondary, capturedAt); }
    if (first.chainId !== second.chainId) return failure("EVIDENCE_MISMATCH", "RPC_CHAIN_ID_CONFLICT", primary, secondary, capturedAt);
    if (first.block.hash.toLowerCase() !== second.block.hash.toLowerCase()) return failure(request.blockTag ? "REORG_DETECTED" : "EVIDENCE_MISMATCH", "RPC_BLOCK_HASH_CONFLICT", primary, secondary, capturedAt);
    if (stable(transactionProjection(first.transaction)) !== stable(transactionProjection(second.transaction))) return failure("EVIDENCE_MISMATCH", "RPC_TRANSACTION_CONFLICT", primary, secondary, capturedAt);
    if (stable(first.receipt) !== stable(second.receipt)) return failure("EVIDENCE_MISMATCH", "RPC_RECEIPT_CONFLICT", primary, secondary, capturedAt);
    if (stable(first.targets) !== stable(second.targets)) return failure("EVIDENCE_MISMATCH", "RPC_TARGET_FACT_CONFLICT", primary, secondary, capturedAt);
    if (stable(first.logs) !== stable(second.logs)) return failure("EVIDENCE_MISMATCH", "RPC_LOG_CONFLICT", primary, secondary, capturedAt);
  }
  if (request.maxAgeSeconds !== undefined && Date.parse(capturedAt) / 1000 - first.block.timestamp > request.maxAgeSeconds) return failure("STALE_EVIDENCE", "BLOCK_CONTEXT_TOO_OLD", primary, secondary ?? null, capturedAt);
  if (request.expectedTransaction && request.transactionHash) {
    const tx = first.transaction;
    if (!tx || tx.to?.toLowerCase() !== request.expectedTransaction.to?.toLowerCase() || tx.input.toLowerCase() !== request.expectedTransaction.input.toLowerCase() || BigInt(tx.value) !== BigInt(request.expectedTransaction.value) || (request.expectedTransaction.from && tx.from.toLowerCase() !== request.expectedTransaction.from.toLowerCase()) || (request.expectedTransaction.nonce !== undefined && hexNumber(tx.nonce, "transaction.nonce") !== request.expectedTransaction.nonce)) return failure("EVIDENCE_MISMATCH", "TRANSACTION_PAYLOAD_MISMATCH", primary, secondary ?? null, capturedAt);
  }
  if (first.receipt && first.receipt.status !== "0x1") return failure("EVIDENCE_MISMATCH", "TRANSACTION_EXECUTION_FAILED", primary, secondary ?? null, capturedAt);
  const verificationStatus = first.receipt ? "VERIFIED_POST_EXECUTION" as const : "VERIFIED_PRE_EXECUTION" as const;
  const transaction = first.transaction ? { hash: first.transaction.hash, from: first.transaction.from, to: first.transaction.to, input: first.transaction.input, value: BigInt(first.transaction.value).toString(10), nonce: hexNumber(first.transaction.nonce, "transaction.nonce") } : null;
  const receipt = first.receipt ? { transactionHash: first.receipt.transactionHash, blockHash: first.receipt.blockHash, blockNumber: hexNumber(first.receipt.blockNumber, "receipt.blockNumber"), status: first.receipt.status === "0x1" ? "SUCCESS" as const : "FAILED" as const, logs: first.receipt.logs } : null;
  const canonical = { chainId: first.chainId, executionId: request.executionId, block: first.block, transaction, receipt, targets: first.targets, logs: first.logs, finalityAssumption: request.finality ?? "latest" } as unknown as CanonicalValue;
  return { ok: true, evidence: { status: verificationStatus, verificationStatus, chainId: first.chainId, executionId: request.executionId, finalityAssumption: request.finality ?? "latest", primarySource: primary.name, secondarySource: secondary?.name ?? null, block: first.block, transaction, receipt, targets: first.targets, logs: first.logs, evidenceHash: hashCanonical(canonical), capturedAt } };
}
