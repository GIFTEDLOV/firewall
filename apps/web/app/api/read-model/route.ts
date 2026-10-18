import { loadCanonical } from "../../canonical";
import { NextResponse } from "next/server";
import { ok } from "../_lib/workflow";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") {
    return NextResponse.json({
      scope: "CANONICAL_LIVE_READ_UNAVAILABLE",
      canonical: false,
      writeAuthority: "NONE",
      status: "UNAVAILABLE",
      error: "CANONICAL_READ_UNAVAILABLE",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const live = state.model.source === "LIVE_CANONICAL";
  return ok({ scope: live ? "CANONICAL_LIVE_READ" : "TEST_FIXTURE_NOT_LIVE", canonical: live, writeAuthority: "NONE", model: state.model });
}
