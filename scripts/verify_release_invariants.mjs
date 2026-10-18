import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const source = readFileSync("contracts/firewall_v2_candidate.py");
const schema = readFileSync("artifacts/firewall_v2_candidate.schema.json");
const deployment = JSON.parse(readFileSync("provenance/v2-studionet-deployment.json", "utf8"));
const canonicalReader = readFileSync("packages/genlayer-client/src/canonical-reader.ts", "utf8");
const walletFlow = readFileSync("packages/genlayer-client/src/studionet-workflow.ts", "utf8");
const fixtureLoader = readFileSync("apps/web/app/canonical.ts", "utf8");
const fixtureModel = readFileSync("apps/web/app/canonical-test-fixture.ts", "utf8");
const readerApi = readFileSync("apps/web/app/api/read-model/route.ts", "utf8");
const workflowApi = readFileSync("apps/web/app/api/_lib/workflow.ts", "utf8");

const sourceHash = createHash("sha256").update(source).digest("hex");
const schemaHash = createHash("sha256").update(schema).digest("hex");
const schemaValue = JSON.parse(schema.toString("utf8"));
if (deployment.chain_id !== 61999 || deployment.contract_address !== "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528") throw new Error("V2_DEPLOYMENT_METADATA_MISMATCH");
if (sourceHash !== "b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163" || sourceHash !== deployment.source_sha256) throw new Error("V2_SOURCE_HASH_MISMATCH");
if (schemaHash !== "b313e74d96845f21eae755cdf60329f8c8306ff57f461a9459b42f70f2ae0eca") throw new Error("V2_SCHEMA_HASH_MISMATCH");
if (Object.keys(schemaValue.methods).length !== 14) throw new Error("V2_INTERFACE_METHOD_COUNT_MISMATCH");
if (!canonicalReader.includes("CANONICAL_SOURCE_SHA256") || !canonicalReader.includes("LATEST_FINAL") || !canonicalReader.includes("CANONICAL_DEPLOYMENT_SCHEMA_MISMATCH")) throw new Error("CANONICAL_READER_INTEGRITY_CHECK_MISSING");
if (!walletFlow.includes("DUPLICATE_BROADCAST_BLOCKED") || !walletFlow.includes("FINALIZED_AWAITING_CANONICAL_READBACK")) throw new Error("WALLET_WRITE_LIFECYCLE_GUARD_MISSING");
if (!fixtureLoader.includes('NODE_ENV !== "production"') || !fixtureLoader.includes('FIREWALL_TEST_CANONICAL === "1"')) throw new Error("FIXTURE_PRODUCTION_GUARD_MISSING");
if (!fixtureModel.includes('source: "TEST_FIXTURE"') || !readerApi.includes("TEST_FIXTURE_NOT_LIVE")) throw new Error("TEST_FIXTURE_PROVENANCE_LABEL_MISSING");
if (!workflowApi.includes('writeAuthority: "NONE"')) throw new Error("LOCAL_WORKFLOW_WRITE_AUTHORITY_MISSING");

console.log(JSON.stringify({
  ok: true,
  network: deployment.network,
  chainId: deployment.chain_id,
  contract: deployment.contract_address,
  sourceSha256: sourceHash,
  schemaSha256: schemaHash,
  methodCount: Object.keys(schemaValue.methods).length,
  testFixtureProductionGuard: true,
  duplicateWriteBlock: true,
}));
