import { fail, ok } from "../_lib/workflow";

export const dynamic = "force-dynamic";

/**
 * V2 evidence authenticates an execution that already happened. It cannot be
 * used to authorize a future Safe call. Prospective permits are handled only
 * by the isolated V3 route, which is bound to the Base Sepolia Safe and Guard.
 */
export async function GET() {
  return ok({
    scope: "HISTORICAL_V2_ONLY_NO_PROSPECTIVE_AUTHORITY",
    state: "HISTORICAL_ONLY_NO_PROSPECTIVE_AUTHORIZATION",
    configured: false,
    prospectiveExecutionSupported: false,
    signatureAvailable: false,
    reason: "The historical V2 permit authenticates an already executed Ethereum Mainnet transaction. It cannot authorize a future Safe execution or another EVM chain.",
  });
}

export async function POST() {
  return fail("HISTORICAL_V2_PERMIT_CANNOT_AUTHORIZE_PROSPECTIVE_EVM_EXECUTION", 410);
}
