import { NextResponse } from "next/server";
import { createLocalWorkflowRuntime, LOCAL_ANALYSIS_CHAIN_ID, LOCAL_WORKFLOW_SCOPE, type FirewallApplicationService } from "@firewall/workflow";

type WorkflowRuntimeGlobal = typeof globalThis & { __firewallWorkflowRuntime?: FirewallApplicationService };

function emptyCanonicalReader() {
  return {
    async read() {
      return { mandates: [], executions: [], adjudications: [], permits: [], asOf: new Date(0).toISOString() };
    },
  };
}

export function workflowService(): FirewallApplicationService {
  const scope = globalThis as WorkflowRuntimeGlobal;
  scope.__firewallWorkflowRuntime ??= createLocalWorkflowRuntime(emptyCanonicalReader());
  return scope.__firewallWorkflowRuntime;
}

export function workflowMetadata() {
  return { scope: LOCAL_WORKFLOW_SCOPE, canonical: false, chainContext: LOCAL_ANALYSIS_CHAIN_ID, writeAuthority: "NONE" as const };
}

export async function requestJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new Error("JSON_CONTENT_TYPE_REQUIRED");
  return request.json();
}

export function ok(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "LOCAL_WORKFLOW_REQUEST_FAILED";
  return NextResponse.json({ ...workflowMetadata(), error: message }, { status, headers: { "cache-control": "no-store" } });
}

export function isLocalChain(chainId: number): boolean {
  return chainId === LOCAL_ANALYSIS_CHAIN_ID;
}
