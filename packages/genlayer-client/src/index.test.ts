import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CrashSafeTransactionJournal, FileTransactionJournalStore, InMemoryTransactionJournalStore } from "./index.js";

const base = { operation: "adjudicate_execution", contract: "local-contract", hash: null, method: "adjudicate_execution", chainId: 61997, argsHash: "0xargs", sender: "0xsender", submittedAt: "2026-10-05T00:00:00.000Z" } as const;

describe("crash-safe transaction journal", () => {
  it("persists one hash and recovers after a new journal instance", () => {
    const store = new InMemoryTransactionJournalStore();
    const first = new CrashSafeTransactionJournal(store);
    first.prepare("op-1", base);
    first.transition("op-1", "AWAITING_WALLET");
    first.recordBroadcast("op-1", "0xabc");
    const recovered = new CrashSafeTransactionJournal(store).recover("op-1");
    expect(recovered.hash).toBe("0xabc");
    expect(() => first.recordBroadcast("op-1", "0xdef")).toThrow("TRANSACTION_HASH_REPLACEMENT");
  });

  it("does not confuse finality with canonical success", () => {
    const journal = new CrashSafeTransactionJournal(new InMemoryTransactionJournalStore());
    journal.prepare("op-2", base);
    journal.transition("op-2", "AWAITING_WALLET");
    journal.recordBroadcast("op-2", "0xabc");
    journal.transition("op-2", "PENDING");
    journal.transition("op-2", "FINALIZED", { executionResult: "ERROR" });
    expect(() => journal.transition("op-2", "CANONICAL_SUCCESS")).toThrow("CANONICAL_SUCCESS_REQUIRES_EXECUTION_SUCCESS");
    journal.transition("op-2", "EXECUTION_FAILED");
    expect(journal.recover("op-2").executionResult).toBe("ERROR");
  });

  it("recovers the exact hash from a file journal after process restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "firewall-journal-"));
    try {
      const first = new CrashSafeTransactionJournal(new FileTransactionJournalStore(join(directory, "tx.json")));
      first.prepare("op-file", base);
      first.transition("op-file", "AWAITING_WALLET");
      first.recordBroadcast("op-file", "0xpersisted");
      const second = new CrashSafeTransactionJournal(new FileTransactionJournalStore(join(directory, "tx.json")));
      expect(second.recover("op-file").hash).toBe("0xpersisted");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
