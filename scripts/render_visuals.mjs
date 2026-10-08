import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:3000";
const outputDir = process.env.VISUAL_OUTPUT ?? ".visual-output";
await mkdir(outputDir, { recursive: true });

const views = [
  ["desktop", 1440, 900],
  ["laptop", 1280, 800],
  ["tablet", 768, 1024],
  ["mobile", 390, 844],
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [name, width, height] of views) {
    await page.setViewportSize({ width, height });
    for (const route of ["/", "/app"]) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const safeRoute = route === "/" ? "landing" : "app";
      await page.screenshot({ path: `${outputDir}/${name}-${safeRoute}.png`, fullPage: true });
    }
  }
} finally {
  await browser.close();
}
console.log(`Rendered ${views.length * 2} visual QA screenshots to ${outputDir}`);
