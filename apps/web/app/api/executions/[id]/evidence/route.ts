import { httpRpcSource, verifyEvmEvidence, type EvmEvidenceRequest } from "@firewall/evidence";
import { fail, ok, requestJson, workflowMetadata, workflowService } from "../../../_lib/workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const execution = workflowService().getExecution(id);
    if (!execution) throw new Error("LOCAL_EXECUTION_NOT_FOUND");
    const primaryUrl = process.env.FIREWALL_TARGET_RPC_PRIMARY_URL;
    const secondaryUrl = process.env.FIREWALL_TARGET_RPC_SECONDARY_URL;
    if (!primaryUrl || !secondaryUrl) throw new Error("INDEPENDENT_RPC_CONFIGURATION_REQUIRED");
    const body = await requestJson(request) as Omit<EvmEvidenceRequest, "executionId" | "chainId">;
    const result = await verifyEvmEvidence({ ...body, executionId: id, chainId: execution.chainId, targets: body.targets ?? [] }, httpRpcSource("configured-primary", primaryUrl), httpRpcSource("configured-secondary", secondaryUrl));
    if (!result.ok) return ok({ ...workflowMetadata(), evidence: result.failure }, 409);
    workflowService().saveEvmEvidence(result.evidence);
    return ok({ ...workflowMetadata(), evidence: result.evidence }, 200);
  } catch (error) {
    return fail(error, 503);
  }
}
