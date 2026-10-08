import { fail, ok, requestJson, workflowMetadata, workflowService } from "../_lib/workflow";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const model = await workflowService().readModel();
    return ok({ ...workflowMetadata(), mandates: model.localDrafts });
  } catch (error) {
    return fail(error, 503);
  }
}

export async function POST(request: Request) {
  try {
    const service = workflowService();
    const mandate = service.createMandate(await requestJson(request));
    service.saveMandate(mandate);
    return ok({ ...workflowMetadata(), mandate }, 201);
  } catch (error) {
    return fail(error);
  }
}
