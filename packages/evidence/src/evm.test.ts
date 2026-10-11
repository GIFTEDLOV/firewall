import { describe, expect, it } from "vitest";
import { keccak256 } from "viem";
import { verifyEvmEvidence, type RpcSource } from "./evm.js";

const target = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const sender = "0x0000000000000000000000000000000000000002" as `0x${string}`;
const code = "0x6001600055" as `0x${string}`;
const block = { number: "0x10", hash: `0x${"ab".repeat(32)}`, parentHash: `0x${"cd".repeat(32)}`, timestamp: "0x68e9d100" } as const;
const tx = { hash: `0x${"ef".repeat(32)}`, from: sender, to: target, input: "0xa9059cbb" as `0x${string}`, value: "0x0", nonce: "0x1", blockHash: block.hash, blockNumber: block.number } as const;
const receipt = { transactionHash: tx.hash, blockHash: block.hash, blockNumber: block.number, status: "0x1" as const, logs: [] };

function source(name: string, overrides: Record<string, unknown> = {}): RpcSource {
  return { name, url: `https://${name}.example/rpc`, async request(method) {
    if (method === "eth_chainId") return "0x1" as never;
    if (method === "eth_getBlockByNumber") return { ...block, ...(overrides.block && typeof overrides.block === "object" ? overrides.block : {}) } as never;
    if (method === "eth_getTransactionByHash") return { ...tx, ...(overrides.tx && typeof overrides.tx === "object" ? overrides.tx : {}) } as never;
    if (method === "eth_getTransactionReceipt") { if ("receipt" in overrides && overrides.receipt === null) return null as never; return { ...receipt, ...(overrides.receipt && typeof overrides.receipt === "object" ? overrides.receipt : {}) } as never; }
    if (method === "eth_getCode") return (overrides.code ?? code) as never;
    if (method === "eth_getStorageAt") return "0x" + "00".repeat(32) as never;
    if (method === "eth_getLogs") return [] as never;
    throw new Error(`unexpected method ${method}`);
  } };
}

const request = { chainId: 1, executionId: "EXE-00000001", transactionHash: tx.hash, expectedTransaction: { from: sender, to: target, value: "0", input: tx.input, nonce: 1 }, targets: [{ address: target, expectedCodeHash: keccak256(code) }], finality: "historical" as const, observedAt: "2026-10-11T00:00:00.000Z" };

describe("independent EVM evidence verifier", () => {
  it("verifies a pre-execution package without inventing a receipt", async () => {
    const { transactionHash: _transactionHash, expectedTransaction: _expectedTransaction, ...preExecutionRequest } = request;
    const result = await verifyEvmEvidence(preExecutionRequest, source("primary"), source("secondary"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.verificationStatus).toBe("VERIFIED_PRE_EXECUTION");
      expect(result.evidence.receipt).toBeNull();
      expect(result.evidence.transaction).toBeNull();
    }
  });

  it("verifies post-execution facts from two matching RPC sources", async () => {
    const result = await verifyEvmEvidence(request, source("primary"), source("secondary"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evidence.verificationStatus).toBe("VERIFIED_POST_EXECUTION");
  });

  it("does not authenticate a fabricated receipt, wrong chain, payload, stale block, or conflicting block", async () => {
    expect((await verifyEvmEvidence(request, source("primary", { receipt: null }), source("secondary"))).ok).toBe(false);
    expect((await verifyEvmEvidence({ ...request, chainId: 5 }, source("primary"))).ok).toBe(false);
    expect((await verifyEvmEvidence({ ...request, expectedTransaction: { ...request.expectedTransaction, input: "0xdeadbeef" } }, source("primary"))).ok).toBe(false);
    expect((await verifyEvmEvidence({ ...request, maxAgeSeconds: 1 }, source("primary"))).ok).toBe(false);
    const conflict = await verifyEvmEvidence(request, source("primary", { block: { hash: `0x${"01".repeat(32)}` } }), source("secondary"));
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(["EVIDENCE_MISMATCH", "REORG_DETECTED"]).toContain(conflict.failure.status);
  });

  it("rejects a failed execution receipt", async () => {
    const result = await verifyEvmEvidence(request, source("primary", { receipt: { status: "0x0" } }), source("secondary", { receipt: { status: "0x0" } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe("TRANSACTION_EXECUTION_FAILED");
  });
});
