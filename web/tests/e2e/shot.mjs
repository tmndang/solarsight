// Dev helper: screenshot the built app. Usage: node tests/e2e/shot.mjs <url> <out.png> [width] [height]
import { chromium } from "playwright-core";

const [url = "http://localhost:3000", out = "/tmp/shot.png", w = "1440", h = "900"] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log(logs.join("\n"));
await browser.close();
