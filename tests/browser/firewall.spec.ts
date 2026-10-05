import { test, expect } from "@playwright/test";

const routes = ["/", "/mandates", "/mandates/new", "/executions/new", "/activity", "/integrate", "/adjudications/CONTROLLED_FIXTURE_BLOCKED", "/permits/CONTROLLED_FIXTURE_PERMITTED"];

test.describe("Firewall browser truth", () => {
  test("dashboard renders without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Keep the mandate intact." })).toBeVisible();
    await expect(page.getByText("No activity indexed")).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const route of routes) {
    test(`route ${route} has meaningful content`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).not.toBeEmpty();
      await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    });
  }

  test("local mandate import and execution analysis survive navigation", async ({ page }) => {
    await page.goto("/mandates/new");
    await page.getByRole("button", { name: "Capture immutable draft" }).click();
    await expect(page.getByText("DRAFT_CAPTURED")).toBeVisible();
    const link = page.locator("a.result-link");
    await expect(link).toBeVisible();
    const mandateHref = await link.getAttribute("href");
    expect(mandateHref).toMatch(/^\/mandates\/MAN-\d{8}$/);
    await page.goto("/executions/new");
    await page.getByPlaceholder("MAN-00000001").fill(mandateHref!.split("/").at(-1)!);
    await page.getByRole("button", { name: "Freeze and analyze local package" }).click();
    await expect(page.getByText("ANALYZED")).toBeVisible();
  });

  test("controlled fixtures are visibly not canonical state", async ({ page }) => {
    await page.goto("/adjudications/CONTROLLED_FIXTURE_BLOCKED");
    await expect(page.locator(".callout strong").filter({ hasText: "CONTROLLED_FIXTURE" })).toBeVisible();
    await expect(page.getByText("EXECUTION_BLOCKED")).toBeVisible();
    await page.goto("/permits/CONTROLLED_FIXTURE_PERMITTED");
    await expect(page.locator(".callout strong").filter({ hasText: "CONTROLLED_FIXTURE" })).toBeVisible();
    await expect(page.getByText("EXECUTION_PERMITTED")).toBeVisible();
  });

  test("mobile forensic surface remains usable", async ({ page }) => {
    await page.goto("/executions/CONTROLLED_FIXTURE_EXECUTION_A");
    await expect(page.getByText("What governance approved")).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow-x", "visible");
  });
});
