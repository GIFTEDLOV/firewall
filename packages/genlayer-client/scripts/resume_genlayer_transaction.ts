import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "genlayer-js";
import { resolveFirewallGenLayerNetwork, type FirewallGenLayerNetworkAlias } from "../src/network-config.js";
import {
  resumeDurableTransaction,
  type DurableTransactionRecord,
  type DurableTransactionStore,
} from "../src/durable-transaction.js";

function parseAlias(value: string | undefined): FirewallGenLayerNetworkAlias {
  if (value === "testnet-bradbury" || value === "studionet") return value;
  throw new Error("Usage: resume_genlayer_transaction.ts <testnet-bradbury|studionet> <operation-key>");
}

function parseJournal(text: string): DurableTransactionRecord[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("TRANSACTION_JOURNAL_INVALID");
  return value.filter((record): record is DurableTransactionRecord =>
    typeof record === "object" && record !== null &&
    (record as { schema?: unknown }).schema === "FIREWALL_DURABLE_GENLAYER_TRANSACTION_V1");
}

async function main(): Promise<void> {
  const alias = parseAlias(process.argv[2]);
  const operationKey = process.argv[3];
  if (!operationKey) throw new Error("OPERATION_KEY_REQUIRED");
  const network = resolveFirewallGenLayerNetwork(alias);
  const journalPath = resolve(process.cwd(), network.transactionJournal);
  let records: DurableTransactionRecord[] = [];
  try {
    records = parseJournal(await readFile(journalPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const persist = async (next: readonly DurableTransactionRecord[]) => {
    await mkdir(dirname(journalPath), { recursive: true });
    const temporaryPath = `${journalPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryPath, journalPath);
  };
  const store: DurableTransactionStore = {
    async get(key) { return records.find((record) => record.operationKey === key) ?? null; },
    async put(record) {
      const index = records.findIndex((item) => item.operationKey === record.operationKey);
      records = index < 0 ? [...records, record] : records.map((item, itemIndex) => itemIndex === index ? record : item);
      await persist(records);
    },
    async list() { return records; },
  };
  if (!(await store.get(operationKey))) throw new Error("OPERATION_KEY_NOT_FOUND_IN_NETWORK_JOURNAL");

  const chain = network.chain as unknown as Exclude<NonNullable<Parameters<typeof createClient>[0]>["chain"], undefined>;
  const client = createClient({ chain, endpoint: network.rpcUrl });
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  try {
    const result = await resumeDurableTransaction({
      operationKey,
      store,
      client: client as never,
      signal: controller.signal,
      onUpdate(record) {
        process.stdout.write(`${JSON.stringify({
          at: record.lastPollAt,
          network: record.network,
          operationKey: record.operationKey,
          outerEvmHash: record.evmSubmissionHash,
          outerEvmStatus: record.evmStatus,
          genlayerTxId: record.genlayerTxId,
          consensusStatus: record.consensusStatus,
          projectedStatus: record.projectedStatus,
          resolutionAction: record.resolutionAction,
          consensusResult: record.consensusResult,
          executionResult: record.executionResult,
          stage: record.stage,
          lastPollError: record.lastPollError,
        })}\n`);
      },
    });
    process.stdout.write(`${JSON.stringify({ terminal: true, result }, null, 2)}\n`);
  } catch (error) {
    if (controller.signal.aborted) {
      process.stdout.write("Tracking paused. The same operation key and transaction ID remain in the journal; resume this operation without rebroadcasting.\n");
      return;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
