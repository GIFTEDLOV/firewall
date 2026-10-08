import { loadCanonical } from "../../canonical";
import { fail, ok } from "../_lib/workflow";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return fail({ message: state.error }, 503);
  return ok({ scope: "CANONICAL_LIVE_READ", canonical: true, writeAuthority: "NONE", model: state.model });
}
