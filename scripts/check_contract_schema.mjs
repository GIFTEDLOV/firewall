import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const schemaPath = process.argv[2] ?? "artifacts/firewall_v2_candidate.schema.json";
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const sourcePath = "contracts/firewall_v2_candidate.py";
const source = readFileSync(sourcePath, "utf8");
const sourceSha256 = createHash("sha256").update(source, "utf8").digest("hex");
const schemaSha256 = createHash("sha256").update(readFileSync(schemaPath)).digest("hex");
const deployment = JSON.parse(readFileSync("provenance/v2-studionet-deployment.json", "utf8"));

const expectedMethods = [
  "adjudicate_execution",
  "authenticate_evidence",
  "commit_execution",
  "create_mandate",
  "freeze_mandate",
  "get_adjudications",
  "get_evidence_schema",
  "get_executions",
  "get_mandates",
  "get_permit_status",
  "get_permits",
  "get_semantic_keys",
  "get_semantic_schema",
  "issue_permit",
].sort();
const methods = Object.keys(schema.methods ?? {}).sort();
const views = methods.filter((name) => schema.methods[name]?.readonly === true);
const writes = methods.filter((name) => schema.methods[name]?.readonly === false);
const constructorParams = schema.ctor?.params ?? [];

if (deployment.network !== "studionet" || deployment.chain_id !== 61999) {
  throw new Error("DEPLOYMENT_NETWORK_MISMATCH");
}
if (deployment.contract_address !== "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528") {
  throw new Error("DEPLOYMENT_ADDRESS_MISMATCH");
}
if (sourceSha256 !== deployment.source_sha256 || sourceSha256 !== deployment.canonical_readback?.source_sha256) {
  throw new Error(`DEPLOYED_SOURCE_HASH_MISMATCH:${sourceSha256}`);
}
if (JSON.stringify(methods) !== JSON.stringify(expectedMethods)) {
  throw new Error(`CONTRACT_METHOD_SET_MISMATCH:${methods.join(",")}`);
}
if (views.length !== 8 || writes.length !== 6 || constructorParams.length !== 2) {
  throw new Error(`CONTRACT_SCHEMA_SHAPE_MISMATCH:${views.length}:${writes.length}:${constructorParams.length}`);
}
if (!source.includes('EVIDENCE_SCHEMA = "FIREWALL_EVM_EVIDENCE_V3"')) {
  throw new Error("EVIDENCE_SCHEMA_VERSION_MISSING");
}
if (!source.includes('SEMANTIC_SCHEMA = "FIREWALL_MANDATE_V2"')) {
  throw new Error("SEMANTIC_SCHEMA_VERSION_MISSING");
}
for (const key of [
  "intent_satisfied",
  "scope_expanded",
  "prohibited_effect_present",
  "economic_terms_consistent",
  "administrative_authority_changed",
  "implementation_behavior_consistent",
  "evidence_sufficient",
]) {
  if (!source.includes(`"${key}"`)) throw new Error(`CONTRACT_SEMANTIC_KEY_MISSING:${key}`);
}

console.log(JSON.stringify({
  ok: true,
  contract: deployment.contract_address,
  chainId: deployment.chain_id,
  sourcePath,
  sourceSha256,
  schemaPath,
  schemaSha256,
  methodCount: methods.length,
  viewCount: views.length,
  writeCount: writes.length,
  constructorParameterCount: constructorParams.length,
}));
