import { describe, expect, it, vi } from "vitest";
import {
  createTrackedEip1193Provider,
  newDurableTransactionRecord,
  recordGenLayerTransactionId,
  resumeDurableTransaction,
  type DurableTransactionRecord,
  type DurableTransactionStore,
} from "./durable-transaction.js";

const sender = "0x33653e6e86807e41682d3346cdf648d6653384b1" as const;
const contract = "0x1111111111111111111111111111111111111111" as const;
const protocolId = `0x${"22".repeat(32)}` as const;
const outerHash = `0x${"33".repeat(32)}` as const;
const argumentHash = `0x${"44".repeat(32)}` as const;

function memoryStore(initial: DurableTransactionRecord): DurableTransactionStore {
  const records = new Map([[initial.operationKey, initial]]);
  return {
    async get(key) { return records.get(key) ?? null; },
    async put(record) { records.set(record.operationKey, record); },
    async list() { return [...records.values()]; },
  };
}

function record() {
  return newDurableTransactionRecord({
    operationKey: "qualification:resume-me",
    network: "testnet-bradbury",
    contract,
    sender,
    senderNonce: 0n,
    method: "authenticate_evidence",
    argumentsSha256: argumentHash,
  });
}

describe("durable GenLayer transaction tracking", () => {
  it("persists an outer EVM hash before returning it to the caller", async () => {
    let persistedHash: string | null = null;
    const provider = createTrackedEip1193Provider({
      async request() { return outerHash; },
    }, async (hash) => { persistedHash = hash; });

    const result = await provider.request({ method: "eth_sendTransaction", params: [] });
    expect(persistedHash).toBe(outerHash);
    expect(result).toBe(outerHash);
  });

  it("keeps polling an accepted transaction until finalized and verifies readback", async () => {
    const initial = record();
    initial.genlayerTxId = protocolId;
    const store = memoryStore(initial);
    const statuses = ["ACCEPTED", "ACCEPTED", "FINALIZED"];
    const transaction = vi.fn(async () => {
      const statusName = statuses.shift() ?? "FINALIZED";
      return {
        statusName,
        resultName: "MAJORITY_AGREE",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      } as never;
    });
    const sleep = vi.fn(async () => undefined);
    const client = {
      chain: { consensusMainContract: null },
      async request() { return null; },
      getTransaction: transaction,
      advanced: { async getTransactionLifecycle() { return {
        storedStatus: "ACCEPTED",
        projectedStatus: "FINALIZED",
        resolutionAction: "Finalize",
        resolutionSource: "Decision",
        decisionId: "17",
        decisionActive: true,
        evaluatedAt: 1_800_000_000,
      }; } },
    };

    const result = await resumeDurableTransaction({
      operationKey: initial.operationKey,
      store,
      client: client as never,
      sleep,
      canonicalReadback: async () => ({ status: "CONFIRMED", evidence: { permitCount: 1, readAt: "latest-final" } }),
    });

    expect(transaction).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(result.stage).toBe("CANONICAL_READBACK_CONFIRMED");
    expect(result.finalityObservedAt).not.toBeNull();
    expect(result.consensusResult).toBe("MAJORITY_AGREE");
    expect(result.canonicalReadbackEvidence).toEqual({ permitCount: 1, readAt: "latest-final" });
  });

  it("does not treat majority agreement with a failed execution as success", async () => {
    const initial = record();
    initial.genlayerTxId = protocolId;
    const store = memoryStore(initial);
    const client = {
      chain: { consensusMainContract: null },
      async request() { return null; },
      async getTransaction() {
        return { statusName: "FINALIZED", resultName: "MAJORITY_AGREE", txExecutionResultName: "REVERTED" } as never;
      },
      advanced: { async getTransactionLifecycle() { return {
        storedStatus: "FINALIZED",
        projectedStatus: "FINALIZED",
        resolutionAction: "None",
        resolutionSource: "Stored",
        decisionId: null,
        decisionActive: false,
        evaluatedAt: 1_800_000_000,
      }; } },
    };

    const result = await resumeDurableTransaction({
      operationKey: initial.operationKey,
      store,
      client: client as never,
      sleep: async () => undefined,
    });
    expect(result.stage).toBe("GENLAYER_FINALIZED_EXECUTION_FAILED");
    expect(result.executionResult).toBe("REVERTED");
    expect(result.canonicalReadback).toBe("NOT_CHECKED");
  });

  it("recognizes the stable Studionet receipt shape and strips validator secrets before journaling", async () => {
    const initial = record();
    initial.genlayerTxId = protocolId;
    const store = memoryStore(initial);
    const client = {
      chain: { consensusMainContract: null },
      async request() { return null; },
      async getTransaction() {
        return {
          statusName: "FINALIZED",
          result_name: "MAJORITY_AGREE",
          consensus_data: { leader_receipt: [
            { mode: "leader", execution_result: "SUCCESS", result: "return", node_config: { private_key: "omit" } },
            { mode: "validator", execution_result: "ERROR", result: "contract_error", node_config: { private_key: "omit" } },
          ] },
        } as never;
      },
    };

    const result = await resumeDurableTransaction({
      operationKey: initial.operationKey,
      store,
      client: client as never,
      sleep: async () => undefined,
      canonicalReadback: async () => ({ status: "CONFIRMED", evidence: { permitCount: 1 } }),
    });

    expect(result.stage).toBe("CANONICAL_READBACK_CONFIRMED");
    expect(result.consensusResult).toBe("MAJORITY_AGREE");
    expect(result.executionResult).toBe("FINISHED_WITH_RETURN");
    expect(JSON.stringify(result)).not.toContain("omit");
    expect(JSON.stringify(result)).not.toContain("private_key");
  });

  it("records a protocol transaction ID without overwriting another ID", async () => {
    const initial = record();
    const store = memoryStore(initial);
    await recordGenLayerTransactionId(store, initial.operationKey, protocolId);
    expect((await store.get(initial.operationKey))?.genlayerTxId).toBe(protocolId);
    await expect(recordGenLayerTransactionId(store, initial.operationKey, outerHash)).rejects.toThrow("DURABLE_TRANSACTION_PROTOCOL_ID_CONFLICT");
  });
});
