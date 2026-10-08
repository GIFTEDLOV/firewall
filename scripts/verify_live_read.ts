import { createCanonicalReaderFromEnv } from "../packages/genlayer-client/src/index.ts";

async function main() {
  const model = await createCanonicalReaderFromEnv().read();
  const requireValue = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  };

  requireValue(model.semanticSchema, "FIREWALL_MANDATE_V1", "schema");
  requireValue(model.mandates.length, 1, "mandates");
  requireValue(model.executions.length, 2, "executions");
  requireValue(model.evidence.length, 2, "evidence");
  requireValue(model.adjudications.length, 2, "adjudications");
  requireValue(model.permits.length, 1, "permits");
  requireValue(model.semanticKeys.length, 7, "semantic keys");

  const compliant = model.adjudications.find((item) => item.executionId === "EXE-00000001");
  const adversarial = model.adjudications.find((item) => item.executionId === "EXE-00000002");
  requireValue(compliant?.verdict, "EXECUTION_PERMITTED", "compliant verdict");
  requireValue(model.permits[0]?.permitId, "PRM-00000001", "compliant permit");
  requireValue(adversarial?.verdict, "INCONCLUSIVE", "adversarial verdict");
  if (model.permits.some((item) => item.executionId === "EXE-00000002")) throw new Error("adversarial permit must be absent");
  requireValue(adversarial?.evidenceSufficient, false, "adversarial evidence sufficiency");

  console.log(JSON.stringify({
    schema: model.semanticSchema,
    counts: { mandates: model.mandates.length, executions: model.executions.length, evidence: model.evidence.length, adjudications: model.adjudications.length, permits: model.permits.length },
    compliant: { result: compliant?.verdict, permit: model.permits[0]?.permitId },
    adversarial: { result: adversarial?.verdict, permit: null },
    permitStatuses: model.permitStatuses,
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
