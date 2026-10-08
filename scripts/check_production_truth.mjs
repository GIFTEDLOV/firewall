import { readFileSync } from "node:fs";

const canonical = readFileSync("apps/web/app/canonical.ts", "utf8");
const landing = readFileSync("apps/web/app/page.tsx", "utf8");
const app = readFileSync("apps/web/app/app/page.tsx", "utf8");
const readModelRoute = readFileSync("apps/web/app/api/read-model/route.ts", "utf8");
const workflow = readFileSync("apps/web/app/api/_lib/workflow.ts", "utf8");
const workflowPackage = readFileSync("packages/workflow/src/index.ts", "utf8");

if (!canonical.includes("NODE_ENV !== \"production\"")) throw new Error("FIXTURE_GUARD_MISSING");
if (!canonical.includes("FIREWALL_TEST_CANONICAL === \"1\"")) throw new Error("CONTROLLED_FIXTURE_GUARD_MISSING");
if (landing.includes("canonicalTestFixture") || app.includes("canonicalTestFixture")) throw new Error("CANONICAL_PAGE_IMPORTS_FIXTURE");
if (!readModelRoute.includes('scope: "CANONICAL_LIVE_READ"') || !readModelRoute.includes("canonical: true")) throw new Error("LIVE_ROUTE_PROVENANCE_MISSING");
if (!workflow.includes("LOCAL_WORKFLOW_SCOPE") || !workflowPackage.includes('LOCAL_WORKFLOW_SCOPE = "LOCAL_PRECHAIN_ANALYSIS"')) throw new Error("LOCAL_SCOPE_LABEL_MISSING");
if (!workflow.includes("writeAuthority: \"NONE\"")) throw new Error("LOCAL_WRITE_AUTHORITY_MISSING");

console.log(JSON.stringify({ ok: true, productionCanonical: true, fixtureFallback: false, localWorkflowScope: "LOCAL_PRECHAIN_ANALYSIS" }));
