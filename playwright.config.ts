import { defineConfig, devices } from "@playwright/test";

const testPortText = process.env.FIREWALL_TEST_PORT ?? "3100";
if (!/^\d{1,5}$/.test(testPortText) || Number(testPortText) < 1024 || Number(testPortText) > 65535) {
  throw new Error("FIREWALL_TEST_PORT_INVALID");
}
const testPort = Number(testPortText);
const testBaseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: testBaseURL, trace: "retain-on-failure" },
  webServer: { command: `pnpm --filter @firewall/web exec next dev --hostname 127.0.0.1 --port ${testPort}`, url: testBaseURL, reuseExistingServer: process.env.CI !== "true", timeout: 90_000, env: { ...process.env, FIREWALL_TEST_CANONICAL: "1", FIREWALL_NEXT_DIST_DIR: ".next-e2e" } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true } },
  ],
});
