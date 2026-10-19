import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant } from "genlayer-js/types";

const RPC = "https://studio.genlayer.com/api";
const ADDRESS = "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528" as const;
const CALLER = "0x33653e6e86807e41682d3346cdf648d6653384b1" as const;
const DEPLOYMENT_TX = "0xa3f25170cfa592fa5d289c8c9a9f9662b58815150c02190478f39ed5cb084c20" as const;
const EXPECTED_SOURCE_SHA256 = "b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163";

const client = createClient({ endpoint: RPC, account: CALLER });

async function main() {
  const [source, schema] = await Promise.all([
    client.getContractCode(ADDRESS),
    client.getContractSchema(ADDRESS),
  ]);
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../artifacts/firewall_v2_candidate.schema.json");
  mkdirSync(dirname(schemaPath), { recursive: true });
  writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  const transaction = await client.getTransaction({ hash: DEPLOYMENT_TX as unknown as Parameters<typeof client.getTransaction>[0]["hash"] });
  const rawDeploymentTransaction = transaction as unknown as Record<string, unknown>;
  const deploymentConsensus = transaction.resultName ?? rawDeploymentTransaction.result_name ?? "UNKNOWN";
  const leaderReceipts = Array.isArray((rawDeploymentTransaction.consensus_data as Record<string, unknown> | undefined)?.leader_receipt)
    ? ((rawDeploymentTransaction.consensus_data as Record<string, unknown>).leader_receipt as Record<string, unknown>[])
    : [];
  const deploymentExecution = transaction.txExecutionResultName
    ?? (leaderReceipts.some((item) => {
      const result = typeof item.result === "object" && item.result !== null ? item.result as Record<string, unknown> : {};
      return item.mode === "leader" && item.execution_result === "SUCCESS" && (item.result === "return" || result.status === "return");
    }) ? "FINISHED_WITH_RETURN" : "UNKNOWN");
  const deploymentCalldata = (transaction.data as unknown as { calldata?: { raw?: number[] } } | undefined)?.calldata;
  let deploymentConstructorArgs: unknown = null;
  if (Array.isArray(deploymentCalldata?.raw)) {
    try {
      const decoded = abi.calldata.decode(new Uint8Array(deploymentCalldata.raw));
      deploymentConstructorArgs = decoded instanceof Map ? decoded.get("args") ?? null : (decoded as { args?: unknown }).args ?? null;
    } catch {
      deploymentConstructorArgs = "DEPLOYMENT_CALLDATA_DECODE_FAILED";
    }
  }
  const chainId = await client.getChainId();
  const bytes = new TextEncoder().encode(source);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const methodNames = Object.keys(schema.methods).sort();
  const views = methodNames.filter((name) => schema.methods[name]?.readonly).sort();
  const writes = methodNames.filter((name) => !schema.methods[name]?.readonly).sort();
  const deploymentReceipt = {
    hash: transaction.hash ?? transaction.txId,
    status: transaction.statusName,
    consensusResult: deploymentConsensus,
    executionResult: deploymentExecution,
    feeRelatedFields: Object.keys(transaction.data ?? {}).filter((name) => /fee|value|receipt/i.test(name)).sort(),
    constructorArgs: deploymentConstructorArgs,
  };
  console.log(JSON.stringify({
    deploymentReceipt,
  }));
  const viewNames = [
    "get_evidence_schema",
    "get_semantic_schema",
    "get_semantic_keys",
    "get_mandates",
    "get_executions",
    "get_adjudications",
    "get_permits",
  ];
  const state: Record<string, unknown> = {};
  const stateReadErrors: Record<string, string> = {};
  for (const functionName of viewNames) {
    try {
      state[functionName] = await client.readContract({
        address: ADDRESS,
        functionName,
        args: [],
        transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
      });
    } catch (error) {
      stateReadErrors[functionName] = error instanceof Error ? error.message : "UNKNOWN_READ_ERROR";
    }
  }
  const permits = state.get_permits;
  const permitStatuses: Record<string, unknown> = {};
  if (Array.isArray(permits)) {
    for (const item of permits) {
      if (typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).permit_id === "string") {
        const permitId = (item as Record<string, string>).permit_id;
        if (!permitId) continue;
        try {
          permitStatuses[permitId] = await client.readContract({
            address: ADDRESS,
            functionName: "get_permit_status",
            args: [permitId],
            transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
          });
        } catch (error) {
          stateReadErrors[`get_permit_status:${permitId}`] = error instanceof Error ? error.message : "UNKNOWN_READ_ERROR";
        }
      }
    }
  }
  state.permitStatuses = permitStatuses;
  const result = {
    sdk: "genlayer-js@1.1.8",
    network: studionet.name,
    chainId,
    rpc: RPC,
    contract: ADDRESS,
    deploymentTransaction: DEPLOYMENT_TX,
    sourceBytes: bytes.length,
    sourceSha256,
    sourceMatchesRecordedDeployment: sourceSha256 === EXPECTED_SOURCE_SHA256,
    schemaPath,
    schemaSha256: createHash("sha256").update(JSON.stringify(schema, null, 2) + "\n", "utf8").digest("hex"),
    constructor: schema.ctor,
    schema: { methodCount: methodNames.length, views, writes },
    state,
    stateReadErrors,
  };
  const evidencePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../evidence/qualification/current/studionet-contract-canonical-readback.json");
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify({ deploymentReceipt, ...result }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (chainId !== studionet.id || sourceSha256 !== EXPECTED_SOURCE_SHA256 || methodNames.length !== 14 || views.length !== 8 || writes.length !== 6 || transaction.statusName !== "FINALIZED" || deploymentConsensus !== "MAJORITY_AGREE" || deploymentExecution !== "FINISHED_WITH_RETURN") {
    throw new Error("STUDIONET_DEPLOYMENT_PARITY_FAILED");
  }
  if (Object.keys(stateReadErrors).length > 0) throw new Error("CANONICAL_STATE_READBACK_FAILED");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "STUDIONET_READ_FAILED");
  process.exitCode = 1;
});
