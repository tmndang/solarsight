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

const tray = (page) => page.locator('section[aria-label="Compare"]');
const why = (page) => page.locator('section[aria-label="Why they differ"]');
const cmpSlots = (page) => page.evaluate(() => [...new Set(window.__ssMap.querySourceFeatures("cmp-pt").map((f) => f.properties.slot))].sort().join("")); // dedupe: one copy per tile
const chartBadges = (page) => page.evaluate(() => [...document.querySelectorAll(".recharts-wrapper text")].filter((t) => /^[AB]$/.test(t.textContent)).map((t) => t.textContent).sort().join(""));
const panelTitle = (page) => panel(page).locator("h2").first().innerText();

// The judge demo (spec §41), driven only through the UI from a fresh load.
async function demo(run, opts) {
  console.log(`\n== Demo run ${run}${opts.blockBasemap ? " (basemap blocked)" : ""}`);
  const { browser, page, errors } = await launch(opts);
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await mapReady(page);
  // 1 establish the project
  ok((await page.getByRole("radio", { name: "10 MW" }).getAttribute("data-state")) === "on", "default project size is 10 MW");
  ok((await page.locator("#proj-h").innerText()).toUpperCase() === "PROJECT REQUIREMENTS", "controls are titled Project requirements");
  ok(JSON.stringify(await numbers(page)) === JSON.stringify([434, 361, 75, 10, 2]), `funnel 434 → 361 → 75 → 2 (got ${await numbers(page)})`);
  ok((await funnelText(page)).includes("Pass baseline land screen"), "funnel uses 'Pass baseline land screen'");
  // 2 geography
  const fstate = await page.evaluate(([a, b]) => [a, b].map((id) => window.__ssMap.querySourceFeatures("cand-pt", { filter: ["==", ["get", "site_id"], id] })[0]?.properties.ui_state), [SINGER, WESTPOINT]);
  ok(fstate.every((s) => s === "frontier"), "map renders Singer Site + WestPoint as frontier");
  // 3 select Singer
  await page.getByRole("button", { name: /^.*Singer Site/ }).first().click();
  await page.waitForTimeout(300);
  let txt = await panel(page).innerText();
  ok(/FITS YOUR 10 MW PROJECT/.test(txt) && txt.includes("35.7 ac") && txt.includes("36.2 ac") && txt.includes("+0.5 ac"), "Singer fits 10 MW: required 35.7, available 36.2, margin +0.5 ac");
  ok(txt.includes("PARETO FRONTIER") && txt.includes("No other feasible candidate is at least as good on both active objectives"), "Singer: Pareto frontier with non-superlative explanation");
  ok(!/\bbest\b|optimal|recommended|score/i.test(txt), "no 'best/optimal/recommended/score' language in the site panel");
  ok(await tray(page).count() === 0, "selecting a site does not add it to Compare");
  // 4 geospatial computation: transmission geometry
  await panel(page).getByRole("button", { name: "Show on map" }).click(); await page.waitForTimeout(1200);
  const roles = await page.evaluate(() => [...new Set(window.__ssMap.querySourceFeatures("sel-ctx").map((f) => f.properties.role))].sort().join(","));
  ok(roles === "connector,line,site", `Singer: mapped line + measured shortest segment drawn (${roles})`);
  // 5 select a dominated candidate from the chart
  await page.locator('g[role="button"][aria-label^="Carolina Creosoting"]').click(); await page.waitForTimeout(400);
  txt = await panel(page).innerText();
  ok(txt.includes("STRONG ALTERNATIVE") && /DOMINATED BY\s*Singer Site/.test(txt), "Carolina: strong alternative, dominated by Singer Site");
  ok(txt.includes("0.03 km closer to mapped ≥69 kV transmission") && txt.includes("0.34° flatter on usable land (0.42° vs 0.76°)"), "dominance states the actual differences");
  ok(await tray(page).count() === 0, "Compare still empty (membership is explicit)");
  // 6 compare with dominator (one action)
  await panel(page).getByRole("button", { name: "Compare with Singer Site" }).click(); await page.waitForTimeout(600);
  let t = await tray(page).innerText();
  ok(/A\s*Singer Site/.test(t) && /B\s*Carolina Creosoting/.test(t), "tray: Ⓐ Singer Site, Ⓑ Carolina Creosoting");
  ok((await page.getByRole("tab", { name: /Compare/ }).getAttribute("data-state")) === "active", "Compare opens");
  let w = await why(page).innerText();
  ok(/WHY\s*A\s*DOMINATES\s*B/i.test(w) && w.includes("Singer Site is at least as good on every active objective and strictly better on at least one."), "Compare explains why Ⓐ dominates Ⓑ");
  ok(w.includes("Choosing Carolina Creosoting Corp. instead of Singer Site gives up 0.03 km of transmission proximity and 0.34° of flatter usable land"), "plain-language consequence with actual differences");
  await page.getByRole("button", { name: "Show both on map" }).click(); await page.waitForTimeout(1200);
  ok(await cmpSlots(page) === "AB", `Show both on map frames Ⓐ and Ⓑ with map badges (${await cmpSlots(page)})`);
  ok(await chartBadges(page) === "", "chart badges hidden while the Compare tab is shown"); // chart is the other tab
  await page.getByRole("tab", { name: "Tradeoffs" }).click(); await page.waitForTimeout(300);
  ok(await chartBadges(page) === "AB", `chart marks Ⓐ and Ⓑ (${await chartBadges(page)})`);
  // 7 frontier vs frontier tradeoff
  await tray(page).getByRole("button", { name: "Singer Site", exact: true }).click(); await page.waitForTimeout(400);
  ok(await panelTitle(page) === "Singer Site", "tray name selects the site");
  await panel(page).getByRole("button", { name: /Compare with WestPoint/ }).click(); await page.waitForTimeout(600);
  w = await why(page).innerText();
  ok(/WHY BOTH ARE ON THE FRONTIER/i.test(w) && w.includes("Neither candidate dominates the other."), "frontier vs frontier: neither dominates");
  ok(/SINGER SITE[\s\S]*Farther from mapped transmission[\s\S]*Flatter usable terrain[\s\S]*WESTPOINT[\s\S]*Better grid proximity[\s\S]*Intersects site boundary[\s\S]*Steeper usable terrain/i.test(w), "each site wins one objective, with values");
  ok(w.includes("Improving one objective requires sacrificing the other."), "tradeoff stated without calling either better");
  t = await tray(page).innerText();
  ok(/A\s*Singer Site/.test(t) && /B\s*WestPoint/.test(t), "tray: Ⓐ Singer Site, Ⓑ WestPoint");
  // linked views: chart hover <-> map
  await page.getByRole("tab", { name: "Tradeoffs" }).click(); await page.waitForTimeout(300);
  const pt = page.locator('g[role="button"][aria-label^="WestPoint"]');
  await pt.hover(); await page.waitForTimeout(200);
  ok((await page.evaluate((id) => window.__ssMap.getFeatureState({ source: "cand-pt", id }).hover, WESTPOINT)) === true, "chart hover highlights the map site");
  await page.mouse.move(5, 300);
  // 8 change project requirements with Singer selected and A/B in Compare
  await page.getByRole("tab", { name: /Compare/ }).click();
  await page.getByRole("radio", { name: "20 MW" }).click(); await page.waitForTimeout(400);
  txt = await panel(page).innerText();
  ok(await panelTitle(page) === "Singer Site" && txt.includes("DOESN'T FIT YOUR 20 MW PROJECT") && txt.includes("71.4 ac") && txt.includes("36.2 ac") && txt.includes("35.2 ac"), "Singer stays selected: doesn't fit 20 MW (71.4 / 36.2 / shortfall 35.2)");
  ok(JSON.stringify(await numbers(page)) === JSON.stringify([434, 361, 34, 20, 2]), `20 MW funnel 434 → 361 → 34 → 2 (got ${await numbers(page)})`);
  w = await why(page).innerText();
  ok(/Singer Site\s*✕ Doesn't fit[\s\S]*shortfall 35\.2 ac[\s\S]*WestPoint Home, Former\s*✓ Fits[\s\S]*margin \+/.test(w), "Compare survives and re-evaluates: Ⓐ doesn't fit, Ⓑ fits");
  t = await tray(page).innerText();
  ok(/A\s*Singer Site/.test(t) && /B\s*WestPoint/.test(t), "Compare membership unchanged after project change");
  await page.getByRole("tab", { name: "Tradeoffs" }).click(); await page.waitForTimeout(300);
  const f20 = await page.locator('g[role="button"][aria-label*="Pareto frontier"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").split(":")[0]).sort());
  ok(f20.length === 2 && f20[0].startsWith("Maxton Feed Mill") && f20[1].startsWith("WestPoint"), `20 MW frontier = WestPoint Home + Maxton Feed Mill (got ${f20.join(", ")})`);
  ok((await page.locator('g[role="button"][aria-label^="Singer Site"]').getAttribute("aria-label")).includes("doesn't fit"), "chart keeps Singer plotted as doesn't fit");
  // provenance
  await page.getByRole("button", { name: /Open methodology/ }).click(); await page.waitForTimeout(300);
  ok((await page.getByRole("dialog").innerText()).includes("What SolarSight is"), "methodology opens in-app");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok((await page.getByRole("dialog").count()) === 0 && await panelTitle(page) === "Singer Site", "methodology closes; selection preserved");
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
    await page.getByRole("radio", { name: `${g}%`, exact: true }).click();
    ok((await numbers(page))[2] === n, `${g}% max grade → ${n} fit at 10 MW`);
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
  // grid distance 0 is a geometric state: text, chart tick, and transmission geometry for the selected site
  await page.goto(`${URL}/?site=${WESTPOINT}`, { waitUntil: "domcontentloaded" });
  await mapReady(page); await page.waitForTimeout(600);
  const txt = await panel(page).innerText();
  ok(txt.includes("Mapped ≥69 kV transmission intersects site boundary") && !txt.includes("0.00 km"), "zero grid distance reads 'Mapped ≥69 kV transmission intersects site boundary', never 0.00 km");
  ok((await page.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first().textContent()) === "Intersects", "chart zero tick reads 'Intersects'");
  ok((await page.locator('g[role="button"][aria-label^="WestPoint"]').getAttribute("aria-label")).includes("intersects site boundary"), "chart point accessible name states intersection");
  await panel(page).getByRole("button", { name: "Show on map" }).click(); await page.waitForTimeout(1200);
  let roles = await page.evaluate(() => [...new Set(window.__ssMap.querySourceFeatures("sel-ctx").map((f) => f.properties.role))].sort().join(","));
  ok(roles === "line,site", `intersecting site shows line over polygon, no connector (${roles})`);
  ok((await page.locator('[aria-label="Map legend"]').innerText()).includes("Mapped ≥69 kV line (OSM)"), "legend explains the transmission line");
  await page.goto(`${URL}/?site=${CAROLINA}`, { waitUntil: "domcontentloaded" });
  await mapReady(page); await page.waitForTimeout(600);
  await panel(page).getByRole("button", { name: "Show on map" }).click(); await page.waitForTimeout(1200);
  roles = await page.evaluate(() => [...new Set(window.__ssMap.querySourceFeatures("sel-ctx").map((f) => f.properties.role))].sort().join(","));
  ok(roles === "connector,line,site", `non-zero site shows line + shortest-distance connector (${roles})`);
  ok((await panel(page).innerText()).includes("0.06 km"), "non-zero distance still shown in km");
  // explicit membership: Add to Compare, ✓ In Compare, full at two
  await panel(page).getByRole("button", { name: "Add to Compare" }).click();
  ok(/A\s*Carolina Creosoting/.test(await tray(page).innerText()), "Add to Compare puts the site in slot Ⓐ");
  ok(await panel(page).getByRole("button", { name: /In Compare/ }).count() === 1, "button changes to ✓ In Compare");
  ok((await tray(page).innerText()).includes("Select another site to compare"), "tray prompts for a second site");
  await page.locator('g[role="button"][aria-label^="WestPoint"]').click(); await page.waitForTimeout(300);
  await panel(page).getByRole("button", { name: "Add to Compare" }).click();
  await page.locator('g[role="button"][aria-label^="Singer Site"]').click(); await page.waitForTimeout(300);
  ok(await panel(page).getByRole("button", { name: "Add to Compare" }).isDisabled(), "third site cannot be added until one is removed");
  await tray(page).getByRole("button", { name: "Remove Carolina Creosoting Corp. from Compare" }).click();
  ok(/A\s*Select another site[\s\S]*B\s*WestPoint/.test(await tray(page).innerText()), "removing Ⓐ keeps Ⓑ's identity");
  await page.getByRole("button", { name: "Clear" }).click().catch(async () => { await tray(page).getByRole("button", { name: /Remove WestPoint/ }).click(); });
  // no-results: quarries @ 20 MW
  await page.getByRole("combobox", { name: "Candidate type" }).click();
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
