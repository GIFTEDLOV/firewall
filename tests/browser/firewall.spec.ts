import { test, expect, type Page } from "@playwright/test";

const canonicalRoutes = [
  "/app",
  "/mandates",
  "/mandates/MAN-00000001",
  "/executions",
  "/executions/EXE-00000001",
  "/executions/EXE-00000002",
  "/adjudications/ADJ-00000002",
  "/permits/PRM-00000001",
  "/activity",
  "/integrate",
];

async function expectNoBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error: Error) => errors.push(error.message));
  return errors;
}

test.describe("Firewall competition product", () => {
  test("landing explains the product and its live proof", async ({ page }) => {
    const errors = await expectNoBrowserErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Governance approved one thing/i })).toBeVisible();
    await expect(page.getByText("Semantic execution security / GenLayer")).toBeVisible();
    await expect(page.getByText("EXECUTION_PERMITTED")).toBeVisible();
    await expect(page.getByText("INCONCLUSIVE / NO PERMIT", { exact: true })).toBeVisible();
    await expect(page.getByText("evidence_sufficient=false")).toBeVisible();
    await page.getByRole("link", { name: /Open Firewall/ }).click();
    await expect(page).toHaveURL(/\/app$/);
    expect(errors).toEqual([]);
  });

  test("control plane renders canonical counts and both qualification paths", async ({ page }) => {
    const errors = await expectNoBrowserErrors(page);
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Keep the mandate intact." })).toBeVisible();
    await expect(page.locator(".canonical-stats .stat-value").allTextContents()).resolves.toEqual(["1", "2", "2", "2", "1"]);
    await expect(page.getByText("EXE-00000001", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("EXECUTION_PERMITTED", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("PRM-00000001", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("EXE-00000002", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("NO PERMIT", { exact: true }).first()).toBeVisible();
    for (const key of ["intent_satisfied", "scope_expanded", "prohibited_effect_present", "economic_terms_consistent", "administrative_authority_changed", "implementation_behavior_consistent", "evidence_sufficient"]) await expect(page.getByText(key, { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const route of canonicalRoutes) {
    test(`canonical route ${route} is meaningful`, async ({ page }) => {
      const errors = await expectNoBrowserErrors(page);
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator("body")).not.toBeEmpty();
      await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test("canonical details expose evidence, vectors, permit state, and missing records", async ({ page }) => {
    await page.goto("/executions/EXE-00000002");
    await expect(page.getByText("Authenticated evidence")).toBeVisible();
    await expect(page.getByText("evidence_sufficient", { exact: true })).toBeVisible();
    await page.goto("/adjudications/ADJ-00000002");
    await expect(page.getByText("INCONCLUSIVE", { exact: true })).toBeVisible();
    await expect(page.getByText("evidence sufficiency false", { exact: true })).toBeVisible();
    await page.goto("/permits/PRM-00000001");
    await expect(page.locator(".detail-id").filter({ hasText: "PRM-00000001" }).first()).toBeVisible();
    await page.goto("/permits/PRM-00000002");
    await expect(page.getByText("Canonical permit not found")).toBeVisible();
  });

  test("off-chain workflow APIs are live and visibly non-canonical", async ({ page }) => {
    const mandates = await page.request.get("/api/mandates");
    expect(mandates.status()).toBe(200);
    expect((await mandates.json()).scope).toBe("LOCAL_PRECHAIN_ANALYSIS");
    const model = await page.request.get("/api/read-model");
    expect(model.status()).toBe(200);
    expect((await model.json()).scope).toBe("CANONICAL_LIVE_READ");

    await page.goto("/mandates/new");
    await expect(page.getByText("LOCAL_PRECHAIN_ANALYSIS")).toBeVisible();
    await page.getByRole("button", { name: "Capture local draft" }).click();
    await expect(page.getByText("DRAFT_CAPTURED")).toBeVisible();
    const link = page.locator("a.result-link").last();
    await expect(link).toBeVisible();
    const mandateHref = await link.getAttribute("href");
    expect(mandateHref).toMatch(/^\/local\/mandates\/MAN-\d{8}$/);
    await page.goto(mandateHref!);
    await expect(page.getByText("No canonical mandate was created")).toBeVisible();
    await page.goto("/executions/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Analyze candidate package" })).toBeVisible();
    await page.waitForTimeout(750);
    const localMandateInput = page.getByPlaceholder("MAN-00000001");
    await localMandateInput.click();
    await localMandateInput.fill(mandateHref!.split("/").at(-1)!);
    await expect(page.getByRole("button", { name: "Freeze and analyze local package" })).toBeEnabled();
    await page.getByRole("button", { name: "Freeze and analyze local package" }).click();
    await expect(page.getByText("ANALYZED_LOCAL")).toBeVisible();
    await expect(page.getByText("LOCAL_PRECHAIN_ANALYSIS")).toBeVisible();
  });

  test("controlled fixtures remain isolated from canonical routes", async ({ page }) => {
    await page.goto("/adjudications/CONTROLLED_FIXTURE_BLOCKED");
    await expect(page.locator(".callout strong").filter({ hasText: "CONTROLLED_FIXTURE" })).toBeVisible();
    await expect(page.getByText("EXECUTION_BLOCKED", { exact: true })).toBeVisible();
    await page.goto("/permits/CONTROLLED_FIXTURE_PERMITTED");
    await expect(page.locator(".callout strong").filter({ hasText: "CONTROLLED_FIXTURE" })).toBeVisible();
    await expect(page.getByText("EXECUTION_PERMITTED", { exact: true })).toBeVisible();
  });

  test("responsive layout and keyboard focus remain usable", async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const metrics = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 8);
    }
    await page.goto("/app");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });

  test("404 and backend failure states are explicit", async ({ page }) => {
    const missingApi = await page.request.get("/api/mandates/MAN-99999999");
    expect(missingApi.status()).toBe(404);
    expect((await missingApi.json()).error).toBe("LOCAL_MANDATE_NOT_FOUND");
    await page.goto("/mandates/MAN-99999999");
    await expect(page.getByText("Canonical mandate not found")).toBeVisible();
    const missingRoute = await page.goto("/route-does-not-exist");
    expect(missingRoute?.status()).toBe(404);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });
});
