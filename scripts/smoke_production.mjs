import { chromium, request as playwrightRequest } from "@playwright/test";

const baseUrl = process.env.PRODUCTION_BASE_URL ?? "https://firewall-xi.vercel.app";
const expected = {
  contract: "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528",
  chain: 61999,
  schema: "FIREWALL_MANDATE_V2",
  evidenceSchema: "FIREWALL_EVM_EVIDENCE_V3",
  keys: [
    "intent_satisfied",
    "scope_expanded",
    "prohibited_effect_present",
    "economic_terms_consistent",
    "administrative_authority_changed",
    "implementation_behavior_consistent",
    "evidence_sufficient",
  ],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function json(value, label) {
  assert(value && typeof value === "object", `${label}: invalid JSON object`);
  return value;
}

const pause = (milliseconds = 11000) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const api = await playwrightRequest.newContext({ baseURL: baseUrl });
const smoke = { routes: {}, api: {}, consoleErrors: [], pageErrors: [] };

try {
  const apiPaths = [
    "/api/read-model",
    "/api/activity",
    "/api/mandates",
    "/api/mandates/MAN-99999999",
  ];
  for (const [index, path] of apiPaths.entries()) {
    if (index > 0 && (path === "/api/read-model" || path === "/api/activity")) await pause();
    const response = await api.get(path);
    smoke.api[path] = response.status();
    if (path.endsWith("MAN-99999999")) {
      assert(response.status() === 404, `${path}: expected 404, got ${response.status()}`);
      continue;
    }
    assert(response.ok(), `${path}: expected success, got ${response.status()}`);
    const body = json(await response.json(), path);
    if (path === "/api/read-model") {
      assert(body.scope === "CANONICAL_LIVE_READ", "read-model: wrong provenance scope");
      assert(body.canonical === true && body.writeAuthority === "NONE", "read-model: unsafe provenance");
      const model = json(body.model, "read-model.model");
      assert(model.source === "LIVE_CANONICAL", "read-model: fixture or unknown source");
      assert(model.config.contractAddress.toLowerCase() === expected.contract.toLowerCase(), "read-model: contract mismatch");
      assert(model.config.chainId === expected.chain, "read-model: chain mismatch");
      assert(model.semanticSchema === expected.schema, "read-model: schema mismatch");
      assert(model.evidenceSchema === expected.evidenceSchema, "read-model: evidence schema mismatch");
      assert(JSON.stringify(model.semanticKeys) === JSON.stringify(expected.keys), "read-model: semantic keys mismatch");
      assert(Array.isArray(model.mandates) && Array.isArray(model.executions) && Array.isArray(model.evidence) && Array.isArray(model.adjudications) && Array.isArray(model.permits), "read-model: V2 state shape mismatch");
      assert(model.mandates.length > 0 && model.executions.length > 0 && model.evidence.length > 0 && model.adjudications.length > 0 && model.permits.length > 0, "read-model: live qualification has not produced canonical permit state");
      const permitted = model.adjudications.find((item) => item.verdict === "EXECUTION_PERMITTED");
      assert(permitted && model.permits.some((item) => item.executionId === permitted.executionId), "read-model: no permitted adjudication has a matching canonical permit");
      smoke.api.liveModel = { schema: model.semanticSchema, evidenceSchema: model.evidenceSchema, counts: [model.mandates.length, model.executions.length, model.evidence.length, model.adjudications.length, model.permits.length] };
    }
    if (path === "/api/activity") {
      assert(body.scope === "CANONICAL_LIVE_READ" && body.canonical === true, "activity: wrong provenance scope");
    }
    if (path === "/api/mandates") {
      assert(body.scope === "LOCAL_PRECHAIN_ANALYSIS" && body.canonical === false, "mandates API: local scope missing");
      assert(body.chainContext === 61127 && body.writeAuthority === "NONE", "mandates API: local chain/write context missing");
    }
  }

  const routes = [
    "/",
    "/app",
    "/mandates",
    "/mandates/MAN-00000001",
    "/executions",
    "/executions/EXE-00000001",
    "/executions/EXE-00000002",
    "/adjudications/ADJ-00000001",
    "/adjudications/ADJ-00000002",
    "/permits/PRM-00000001",
    "/activity",
    "/integrate",
    "/executions/new",
    "/mandates/new",
    "/local/mandates/MAN-00000001",
    "/local/executions/EXE-00000001",
  ];
  for (const path of routes) {
    if (!path.startsWith("/local/") && !["/integrate", "/executions/new", "/mandates/new"].includes(path)) await pause();
    const response = await api.get(path);
    smoke.routes[path] = response.status();
    assert(response.status() === 200, `${path}: expected 200, got ${response.status()}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (message) => { if (message.type() === "error") smoke.consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => smoke.pageErrors.push(error.message));
    await pause();
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("heading", { name: /Governance approved one thing/ }).waitFor();
    await page.getByText("Semantic execution security / GenLayer", { exact: true }).waitFor();
    await page.getByText(/Canonical state/i).first().waitFor();
    await pause();
    await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByText("CONTRACT RECORDS", { exact: true }).first().waitFor();
    await page.getByText("EXECUTION_PERMITTED", { exact: true }).first().waitFor();
    await page.getByText("INCONCLUSIVE", { exact: true }).first().waitFor();
    await page.getByText("NO PERMIT", { exact: true }).first().waitFor();
    await page.goto(`${baseUrl}/executions/new`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByText("LOCAL_PRECHAIN_ANALYSIS", { exact: true }).waitFor();
  } finally {
    await browser.close();
  }
  assert(smoke.consoleErrors.length === 0, `browser console errors: ${smoke.consoleErrors.join(" | ")}`);
  assert(smoke.pageErrors.length === 0, `browser page errors: ${smoke.pageErrors.join(" | ")}`);
  console.log(JSON.stringify({ baseUrl, ...smoke }, null, 2));
} finally {
  await api.dispose();
}
