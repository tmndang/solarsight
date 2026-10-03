// End-to-end demo-path test against the built static app (npm run build && npm start, or E2E_URL).
// Runs the judge demo twice from fresh loads, then edge cases. Exits non-zero on any failure.
// Usage: E2E_URL=http://localhost:3000 node tests/e2e/demo.mjs   (or: npm run e2e)
import { launch, funnelText } from "./browser.mjs";

const URL = process.env.E2E_URL || "http://localhost:3000";
const SINGER = "DEQ-02005-98-007", WESTPOINT = "DEQ-18035-14-083", CAROLINA = "DEQ-08020-04-010";
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`); if (!cond) failures++; };
const panel = (page) => page.locator('aside[aria-label="Selected site"]');
const numbers = async (page) => (await funnelText(page)).match(/\d+/g).map(Number);
const mapReady = (page) => page.waitForFunction(() => window.__ssMap && window.__ssMap.loaded(), null, { timeout: 30000 });

async function demo(run, opts) {
  console.log(`\n== Demo run ${run}${opts.blockBasemap ? " (basemap blocked)" : ""}`);
  const { browser, page, errors } = await launch(opts);
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await mapReady(page);
  // 1-2 default scenario + funnel
  ok((await page.getByRole("radio", { name: "10 MW" }).getAttribute("data-state")) === "on", "default project size is 10 MW");
  ok(JSON.stringify(await numbers(page)) === JSON.stringify([434, 361, 75, 10, 2]), `funnel 434 → 361 → 75 → 2 (got ${await numbers(page)})`);
  ok((await funnelText(page)).includes("Pass baseline land screen"), "funnel uses 'Pass baseline land screen'");
  // 3 frontier
  const frontierList = await page.locator("text=Pareto frontier (2)").count();
  ok(frontierList === 1, "frontier quick list shows 2 sites");
  const fstate = await page.evaluate(([a, b]) => [a, b].map((id) => window.__ssMap.querySourceFeatures("cand-pt", { filter: ["==", ["get", "site_id"], id] })[0]?.properties.ui_state), [SINGER, WESTPOINT]);
  ok(fstate.every((s) => s === "frontier"), "map renders Singer Site + WestPoint as frontier");
  // 4 select Singer
  await page.getByRole("button", { name: /^.*Singer Site/ }).first().click();
  await page.waitForTimeout(300);
  let txt = await panel(page).innerText();
  ok(txt.includes("Singer Site") && txt.includes("35.7 ac") && txt.includes("36.2 ac") && /FITS YOUR 10 MW PROJECT/.test(txt), "Singer Site fits 10 MW: needs 35.7 ac, has 36.2 ac");
  // 5 dominated candidate + explanation + compare
  await page.goto(`${URL}/?site=${CAROLINA}`, { waitUntil: "domcontentloaded" });
  await mapReady(page);
  txt = await panel(page).innerText();
  ok(/Dominated by\s*Singer Site/.test(txt), "Carolina Creosoting dominated by Singer Site");
  ok(txt.includes("0.03 km closer to mapped ≥69 kV transmission (0.03 km vs 0.06 km)") && txt.includes("0.34° flatter on usable land (0.42° vs 0.76°)"), "explanation states both real differences");
  await page.getByRole("button", { name: /Compare these sites/ }).click();
  await page.waitForTimeout(300);
  const cmp = await page.locator("table").filter({ hasText: "Fits your project" }).innerText();
  ok(cmp.includes("Singer Site") && cmp.includes("Carolina Creosoting"), "compare tab shows both sites");
  // 6 linked views: chart hover -> map feature-state, chart click -> selection
  await page.getByRole("tab", { name: "Tradeoffs" }).click();
  const pt = page.locator('g[role="button"][aria-label^="Singer Site"]');
  await pt.hover(); await page.waitForTimeout(200);
  ok((await page.evaluate((id) => window.__ssMap.getFeatureState({ source: "cand-pt", id }).hover, SINGER)) === true, "chart hover highlights the map site");
  await pt.click(); await page.waitForTimeout(200);
  ok((await panel(page).locator("h2").first().innerText()) === "Singer Site", "chart click selects the site globally");
  // presenter zooms back out before hovering the map (WestPoint may be off-screen after the fly to Singer)
  await page.evaluate(() => new Promise((r) => { const m = window.__ssMap; m.once("idle", r); m.jumpTo({ center: [-79.4, 35.4], zoom: 6.6 }); }));
  const westPt = await page.evaluate((id) => { const m = window.__ssMap; const f = m.querySourceFeatures("cand-pt", { filter: ["==", ["get", "site_id"], id] })[0]; const r = m.getContainer().getBoundingClientRect(); const p = m.project(f.geometry.coordinates); return { x: r.left + p.x, y: r.top + p.y }; }, WESTPOINT);
  await page.mouse.move(westPt.x, westPt.y); await page.waitForTimeout(250);
  ok((await page.locator('g[role="button"][aria-label^="WestPoint"]').count()) === 1 && (await page.evaluate(() => document.querySelectorAll("svg circle[stroke-width='1.5']").length)) >= 1, "map hover rings the chart point");
  await page.mouse.move(5, 300);
  // 7 switch to 20 MW with Singer selected
  await page.getByRole("radio", { name: "20 MW" }).click();
  await page.waitForTimeout(300);
  txt = await panel(page).innerText();
  ok(txt.includes("Singer Site") && txt.includes("DOESN'T FIT YOUR 20 MW PROJECT") && txt.includes("71.4 ac") && txt.includes("35.2 ac"), "Singer stays selected: doesn't fit 20 MW, needs 71.4, shortfall 35.2");
  ok(JSON.stringify(await numbers(page)) === JSON.stringify([434, 361, 34, 20, 2]), `20 MW funnel 434 → 361 → 34 → 2 (got ${await numbers(page)})`);
  // 8 new frontier
  const f20 = await page.locator('g[role="button"][aria-label*="Pareto frontier"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").split(":")[0]).sort());
  ok(f20.length === 2 && f20[0].startsWith("Maxton Feed Mill") && f20[1].startsWith("WestPoint"), `20 MW frontier = WestPoint Home + Maxton Feed Mill (got ${f20.join(", ")})`);
  // 9 provenance
  await page.getByRole("button", { name: /Open methodology/ }).click();
  await page.waitForTimeout(300);
  ok((await page.getByRole("dialog").innerText()).includes("What SolarSight is"), "methodology opens in-app");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok((await page.getByRole("dialog").count()) === 0 && (await panel(page).locator("h2").first().innerText()) === "Singer Site", "methodology closes; selection preserved");
  ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  console.log(`  (run took ${((Date.now() - t0) / 1000).toFixed(1)} s of automation)`);
  await browser.close();
}

async function edgeCases() {
  console.log("\n== Edge cases");
  const { browser, page, errors } = await launch({ blockBasemap: true });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await mapReady(page);
  await page.waitForTimeout(500);
  ok(await page.locator("text=Basemap unavailable").count() === 1, "basemap failure → local outlines notice, app usable");
  ok((await page.locator("text=Select a site on the map").count()) === 1, "no-selection empty state");
  // size / terrain / NWI transitions
  const expect = { "5": 162, "10": 75, "20": 34, "40": 16 };
  for (const [mw, n] of Object.entries(expect)) {
    await page.getByRole("radio", { name: `${mw} MW` }).click();
    ok((await numbers(page))[2] === n, `${mw} MW → ${n} fit`);
  }
  await page.getByRole("radio", { name: "10 MW" }).click();
  for (const [g, n] of [["5", 55], ["15", 83], ["10", 75]]) {
    await page.getByRole("radio", { name: `${g}% grade`, exact: true }).click();
    ok((await numbers(page))[2] === n, `${g}% grade → ${n} fit at 10 MW`);
  }
  await page.getByRole("switch", { name: /Exclude NWI/ }).click();
  ok((await numbers(page))[2] === 82, "NWI included → 82 fit at 10 MW");
  await page.getByRole("switch", { name: /Exclude NWI/ }).click();
  // unmatched EPA candidate
  await page.goto(`${URL}/?site=DEQ-25097-21-032`, { waitUntil: "domcontentloaded" });
  await mapReady(page);
  await panel(page).getByRole("button", { name: /EPA RE-Powering screen/i }).click();
  ok((await panel(page).innerText()).includes("No historical EPA RE-Powering match"), "unmatched EPA → explicit message, no zeros");
  ok((await panel(page).innerText()).includes("Not assessed"), "FEMA shown as not assessed");
  // no-results: quarries @ 20 MW
  await page.getByRole("combobox", { name: "Candidate set" }).click();
  await page.getByRole("option", { name: /Quarries/ }).click();
  await page.getByRole("radio", { name: "20 MW" }).click();
  await page.waitForTimeout(200);
  const nr = await page.locator('[role="status"]').filter({ hasText: "No quarries" }).innerText().catch(() => "");
  ok(nr.includes("17.4 MW AC") && nr.includes("Try 10 MW"), "quarries @ 20 MW → no-results overlay with real suggestions");
  ok((await page.getByRole("radio", { name: "20 MW" }).getAttribute("data-state")) === "on", "suggestions do not change assumptions automatically");
  // keyboard shortcuts: ] / [ step project size
  await page.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => {});
  await page.keyboard.press("["); await page.waitForTimeout(150);
  ok((await page.getByRole("radio", { name: "10 MW" }).getAttribute("data-state")) === "on", "[ steps project size down");
  await page.keyboard.press("]"); await page.waitForTimeout(150);
  ok((await page.getByRole("radio", { name: "20 MW" }).getAttribute("data-state")) === "on", "] steps project size up");
  // map canvas follows bottom-panel collapse
  const canvasH = () => page.evaluate(() => window.__ssMap.getCanvas().clientHeight);
  const h0 = await canvasH();
  await page.getByRole("button", { name: /Collapse tradeoff panel/ }).click(); await page.waitForTimeout(400);
  const h1 = await canvasH();
  await page.getByRole("button", { name: /Expand tradeoff panel/ }).click(); await page.waitForTimeout(400);
  ok(h1 > h0 + 150 && (await canvasH()) === h0, `map resizes with the bottom panel (${h0} → ${h1} → ${await canvasH()})`);
  // narrower desktop: site panel overlays the map; selecting from the list keeps the site visible
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.goto(`${URL}/?site=DEQ-02005-98-007`, { waitUntil: "domcontentloaded" });
  await mapReady(page); await page.waitForTimeout(1200);
  const vis = await page.evaluate(() => { const m = window.__ssMap; const r = m.getContainer().getBoundingClientRect(); const p = m.project(m.querySourceFeatures("cand-pt", { filter: ["==", ["get", "site_id"], "DEQ-02005-98-007"] })[0].geometry.coordinates); const a = document.querySelector('aside[aria-label="Selected site"]').getBoundingClientRect(); return r.left + p.x < a.left; });
  ok(vis, "at 1180 px the selected site is not hidden behind the site panel");
  // resize
  for (const [w, h] of [[1180, 800], [820, 1000], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!overflow, `no horizontal overflow at ${w}px`);
  }
  ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  await browser.close();
}

// Basemap tiles are blocked by default (deterministic); E2E_LIVE_BASEMAP=1 lets the real request go out.
const blockBasemap = process.env.E2E_LIVE_BASEMAP !== "1";
await demo(1, { blockBasemap });
await demo(2, { blockBasemap });
await edgeCases();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll e2e checks passed");
process.exit(failures ? 1 : 0);
