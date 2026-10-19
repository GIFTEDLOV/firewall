import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ok } from "../../_lib/workflow";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const path = resolve(process.cwd(), "../../evidence/qualification/current/sepolia-canary-local-preflight.json");
    const artifact = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const facts = artifact.facts as Record<string, unknown> | undefined;
    if (artifact.scope !== "LOCAL_PROVIDER_NORMALIZATION_ONLY_NOT_GENLAYER_VALIDATOR_CONSENSUS" || artifact.providerFactsMatch !== true || !facts || Number(artifact.chainId) !== 11155111 || typeof artifact.sourceA !== "string" || typeof artifact.sourceB !== "string") {
      return ok({ scope: "LOCAL_NORMALIZATION_ONLY_EXPECTED_FACTS", available: false, validatorAuthentication: false, error: "SEPOLIA_CANARY_EVIDENCE_ARTIFACT_INVALID" }, 503);
    }
    return ok({
      scope: "LOCAL_NORMALIZATION_ONLY_EXPECTED_FACTS",
      available: true,
      validatorAuthentication: false,
      package: { status: "LOCAL_FACTS_MATCHED", sourceA: artifact.sourceA, sourceB: artifact.sourceB, facts },
    });
  } catch {
    return ok({ scope: "LOCAL_NORMALIZATION_ONLY_EXPECTED_FACTS", available: false, validatorAuthentication: false, error: "SEPOLIA_CANARY_EVIDENCE_NOT_PREPARED" }, 503);
  }
}
