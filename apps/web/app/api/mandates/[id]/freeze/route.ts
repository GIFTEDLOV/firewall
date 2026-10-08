import { fail, ok, workflowMetadata, workflowService } from "../../../_lib/workflow";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return ok({ ...workflowMetadata(), mandate: workflowService().freezeMandate(id) });
  } catch (error) {
    return fail(error);
  }
}
