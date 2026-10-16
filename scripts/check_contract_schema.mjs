import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const schemaPath = process.argv[2] ?? "artifacts/firewall_v2_candidate.schema.json";
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const sourcePath = "contracts/firewall.py";
const source = readFileSync(sourcePath, "utf8");
const sourceSha256 = createHash("sha256").update(source.replace(/\r\n/g, "\n"), "utf8").digest("hex");
const schemaSha256 = createHash("sha256").update(readFileSync(schemaPath)).digest("hex");
const expectedMethods = [
  "adjudicate_execution", "authenticate_evidence", "commit_execution", "create_mandate", "freeze_mandate",
  "get_adjudications", "get_evidence_schema", "get_executions", "get_mandates", "get_permit_status",
  "get_permits", "get_semantic_keys", "get_semantic_schema", "issue_permit",
].sort();
const methods = Object.keys(schema.methods ?? {}).sort();
const views = methods.filter((name) => schema.methods[name]?.readonly === true);
const writes = methods.filter((name) => schema.methods[name]?.readonly === false);
const constructorParams = schema.ctor?.params ?? [];

if (sourceSha256 !== "b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163") {
  throw new Error(`DEPLOYED_SOURCE_HASH_MISMATCH:${sourceSha256}`);
}
if (schemaSha256 !== "b313e74d96845f21eae755cdf60329f8c8306ff57f461a9459b42f70f2ae0eca") {
  throw new Error(`DEPLOYED_SCHEMA_HASH_MISMATCH:${schemaSha256}`);
}
if (JSON.stringify(methods) !== JSON.stringify(expectedMethods)) throw new Error(`CONTRACT_METHOD_SET_MISMATCH:${methods.join(",")}`);
if (views.length !== 8 || writes.length !== 6 || constructorParams.length !== 2) {
  throw new Error(`CONTRACT_SCHEMA_SHAPE_MISMATCH:${views.length}:${writes.length}:${constructorParams.length}`);
}
if (!source.includes('EVIDENCE_SCHEMA = "FIREWALL_EVM_EVIDENCE_V3"')) throw new Error("EVIDENCE_SCHEMA_VERSION_MISSING");
if (!source.includes('SEMANTIC_SCHEMA = "FIREWALL_MANDATE_V2"')) throw new Error("SEMANTIC_SCHEMA_VERSION_MISSING");
for (const key of [
  "intent_satisfied", "scope_expanded", "prohibited_effect_present", "economic_terms_consistent",
  "administrative_authority_changed", "implementation_behavior_consistent", "evidence_sufficient",
]) if (!source.includes(`"${key}"`)) throw new Error(`CONTRACT_SEMANTIC_KEY_MISSING:${key}`);

console.log(JSON.stringify({ ok: true, sourcePath, sourceSha256, schemaPath, schemaSha256, methodCount: methods.length, viewCount: views.length, writeCount: writes.length, constructorParameterCount: constructorParams.length }));
