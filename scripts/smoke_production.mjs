import { chromium, request as playwrightRequest } from "@playwright/test";

const baseUrl = process.env.PRODUCTION_BASE_URL ?? "https://firewall-xi.vercel.app";
const expected = {
  contract: "0xEFD65978F54318349139c93c1576ED3eb6f187b6",
  chain: 61997,
  schema: "FIREWALL_MANDATE_V1",
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
      assert(model.config.contractAddress.toLowerCase() === expected.contract.toLowerCase(), "read-model: contract mismatch");
      assert(model.config.chainId === expected.chain, "read-model: chain mismatch");
      assert(model.semanticSchema === expected.schema, "read-model: schema mismatch");
      assert(JSON.stringify(model.semanticKeys) === JSON.stringify(expected.keys), "read-model: semantic keys mismatch");
      assert(model.mandates.length === 1, "read-model: mandate count mismatch");
      assert(model.executions.length === 2, "read-model: execution count mismatch");
      assert(model.evidence.length === 2, "read-model: evidence count mismatch");
      assert(model.adjudications.length === 2, "read-model: adjudication count mismatch");
      assert(model.permits.length === 1, "read-model: permit count mismatch");
      const compliant = model.adjudications.find((item) => item.adjudicationId === "ADJ-00000001");
      const adversarial = model.adjudications.find((item) => item.adjudicationId === "ADJ-00000002");
      assert(compliant?.verdict === "EXECUTION_PERMITTED", "read-model: compliant verdict mismatch");
      assert(adversarial?.verdict === "INCONCLUSIVE" && adversarial.evidenceSufficient === false, "read-model: adversarial verdict mismatch");
      assert(model.permits.some((item) => item.permitId === "PRM-00000001"), "read-model: compliant permit missing");
      assert(!model.permits.some((item) => item.adjudicationId === "ADJ-00000002"), "read-model: adversarial permit present");
      smoke.api.liveModel = { schema: model.semanticSchema, counts: [model.mandates.length, model.executions.length, model.evidence.length, model.adjudications.length, model.permits.length] };
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
    await page.getByText(/Live proof/i).first().waitFor();
    await pause();
    await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByText("LIVE READ", { exact: true }).first().waitFor();
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
