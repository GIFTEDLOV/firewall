import { NextResponse } from "next/server";
import { loadProspective } from "../../../prospective";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await loadProspective();
  if (state.status !== "READY") return NextResponse.json({ scope: "PROSPECTIVE_CANONICAL_READ_UNAVAILABLE", canonical: false, writeAuthority: "NONE", status: "UNAVAILABLE", error: state.error }, { status: 503, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ scope: "PROSPECTIVE_GENLAYER_CANONICAL_READ", canonical: true, writeAuthority: "NONE", model: state.model }, { headers: { "cache-control": "no-store" } });
}
