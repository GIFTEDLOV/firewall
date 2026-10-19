import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const path = resolve(process.cwd(), "../../evidence/qualification/current/historical_facts_local_preflight.json");
    const historicalPackage = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (historicalPackage.status !== "LOCAL_NORMALIZATION_ONLY_NOT_VALIDATOR_AUTHENTICATION") throw new Error("HISTORICAL_FACTS_ARTIFACT_SCOPE_INVALID");
    return NextResponse.json({
      scope: "LOCAL_NORMALIZED_EXPECTED_FACTS_ONLY",
      validatorAuthentication: false,
      package: historicalPackage,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({
      scope: "LOCAL_NORMALIZED_EXPECTED_FACTS_ONLY",
      available: false,
      validatorAuthentication: false,
      error: "LOCAL_HISTORICAL_FACTS_ARTIFACT_NOT_PUBLISHED",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
