// Shared browser launcher for e2e scripts (uses the preinstalled Chromium; no downloads).
import { chromium } from "playwright-core";

export async function launch({ width = 1440, height = 900, blockBasemap = false } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const context = await browser.newContext({ viewport: { width, height } });
  if (blockBasemap) await context.route(/cartocdn|openfreemap/, (r) => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { browser, page, errors };
}

export const funnelText = (page) => page.locator('ol[aria-label="Candidate funnel"]').innerText();
