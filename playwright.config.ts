import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @firewall/api dev", url: "http://127.0.0.1:4001/health", reuseExistingServer: true, timeout: 30_000 },
    { command: "pnpm --filter @firewall/web dev", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 30_000 },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true } },
  ],
});
