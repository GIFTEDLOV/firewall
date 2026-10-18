import { createCanonicalReader, CANONICAL_CHAIN_ID, CANONICAL_CONTRACT_ADDRESS, CANONICAL_RPC_URL } from "../packages/genlayer-client/src/index.ts";

async function main() {
  const model = await createCanonicalReader({
    contractAddress: CANONICAL_CONTRACT_ADDRESS,
    chainId: CANONICAL_CHAIN_ID,
    rpcUrl: CANONICAL_RPC_URL,
  }).read();
  console.log(JSON.stringify({
    status: "LIVE_CANONICAL_READ_VERIFIED",
    contract: model.config.contractAddress,
    chainId: model.config.chainId,
    evidenceSchema: model.evidenceSchema,
    semanticSchema: model.semanticSchema,
    counts: { mandates: model.mandates.length, executions: model.executions.length, evidence: model.evidence.length, adjudications: model.adjudications.length, permits: model.permits.length },
    permitStatuses: model.permitStatuses,
  }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const safeFailure = message.includes("__handle_undefined_method__") || message.includes("__receive__")
    ? "GENVM_METHOD_DISPATCH_UNAVAILABLE"
    : message.startsWith("CANONICAL_")
      ? message.split("\n", 1)[0]
      : "CANONICAL_LIVE_READ_FAILED";
  console.error(JSON.stringify({ status: "LIVE_CANONICAL_READ_UNAVAILABLE", contract: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, error: safeFailure }));
  process.exitCode = 1;
});
