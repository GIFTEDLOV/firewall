import { fail, ok, workflowMetadata, workflowService } from "../../_lib/workflow";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const mandate = workflowService().getMandate(id);
    return mandate ? ok({ ...workflowMetadata(), mandate }) : fail("LOCAL_MANDATE_NOT_FOUND", 404);
  } catch (error) {
    return fail(error, 503);
  }
}
