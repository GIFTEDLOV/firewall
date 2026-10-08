import { fail, isLocalChain, ok, requestJson, workflowMetadata, workflowService } from "../../_lib/workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await requestJson(request) as { mandateId?: string; chainId?: number; targets?: never[]; operations?: never[] };
    if (typeof body.mandateId !== "string" || typeof body.chainId !== "number" || !Array.isArray(body.targets) || !Array.isArray(body.operations)) throw new Error("LOCAL_EXECUTION_REQUEST_INVALID");
    if (!isLocalChain(body.chainId)) throw new Error("LOCAL_ANALYSIS_CHAIN_CONTEXT_REQUIRED");
    const result = workflowService().analyzeExecution(body as never);
    return ok({ ...workflowMetadata(), execution: result.execution, assessment: result.assessment, deterministic: result.deterministic }, 201);
  } catch (error) {
    return fail(error);
  }
}
