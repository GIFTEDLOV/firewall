import { NextResponse } from "next/server";
import historicalPackage from "../../../../../../evidence/qualification/current/historical_facts_local_preflight.json";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    scope: "LOCAL_NORMALIZED_EXPECTED_FACTS_ONLY",
    validatorAuthentication: "NOT_YET_PERFORMED; authenticate_evidence must independently fetch both contract-configured provider URLs inside GenLayer consensus",
    package: historicalPackage,
  }, { headers: { "cache-control": "public, max-age=300" } });
}
