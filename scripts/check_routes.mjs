import { existsSync } from "node:fs";

const required = [
  "apps/web/app/page.tsx",
  "apps/web/app/app/page.tsx",
  "apps/web/app/mandates/page.tsx",
  "apps/web/app/mandates/[id]/page.tsx",
  "apps/web/app/executions/page.tsx",
  "apps/web/app/executions/[id]/page.tsx",
  "apps/web/app/adjudications/[id]/page.tsx",
  "apps/web/app/permits/[id]/page.tsx",
  "apps/web/app/activity/page.tsx",
  "apps/web/app/integrate/page.tsx",
  "apps/web/app/api/mandates/route.ts",
  "apps/web/app/api/read-model/route.ts",
  "apps/web/app/api/activity/route.ts",
  "apps/web/app/api/executions/analyze/route.ts",
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) throw new Error(`ROUTE_FILES_MISSING:${missing.join(",")}`);
console.log(JSON.stringify({ ok: true, routes: required.length }));
