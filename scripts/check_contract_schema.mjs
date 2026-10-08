import { readFileSync } from "node:fs";

const abiPath = process.argv[2] ?? "artifacts/firewall.abi.json";
const abi = JSON.parse(readFileSync(abiPath, "utf8"));
const methods = Object.keys(abi.methods ?? {});
const required = [
  "get_mandates",
  "get_executions",
  "get_evidence",
  "get_adjudications",
  "get_permits",
  "get_permit_status",
  "get_semantic_schema",
  "get_semantic_keys",
];
const missing = required.filter((method) => !methods.includes(method));
if (missing.length) throw new Error(`ABI_SCHEMA_MISSING:${missing.join(",")}`);
if (methods.length !== 14) throw new Error(`ABI_SCHEMA_METHOD_COUNT:${methods.length}`);

const source = readFileSync("contracts/firewall.py", "utf8");
if (!source.includes('SEMANTIC_SCHEMA = "FIREWALL_MANDATE_V1"')) throw new Error("CONTRACT_SCHEMA_VERSION_MISSING");
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

console.log(JSON.stringify({ ok: true, publicMethods: methods.length, requiredReads: required }));
