import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parseData, type CandidateProps } from "@/lib/data/schema";
import { computeScenario, DEFAULT_SCENARIO, usableKey, type Scenario } from "@/lib/scenario/scenario";
import { explainDominance, FRONTIER_EXPLANATION } from "@/lib/explanations/explain";
import { choiceSentence, compareSites, exclusionText, projectFit } from "@/lib/decision/decision";
import { fmtGridValue } from "@/lib/formatting/format";
import { useApp } from "@/store/app-store";

const DATA = join(__dirname, "..", "..", "data", "app");
const { candidates, meta } = parseData(
  JSON.parse(readFileSync(join(DATA, "candidates.geojson"), "utf8")),
  JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8")),
);
const props = candidates.features.map((f) => f.properties);
const byId = new Map(props.map((p) => [p.site_id, p]));
const run = (patch: Partial<Scenario> = {}) => computeScenario(props, meta, { ...DEFAULT_SCENARIO, ...patch });

const SINGER = "DEQ-02005-98-007", WESTPOINT = "DEQ-18035-14-083", MAXTON = "DEQ-21020-17-078";
const CAROLINA = "DEQ-08020-04-010", SCHLAGE = "DEQ-08001-04-064";

describe("project fit", () => {
  it("feasible candidate: required, available and margin", () => {
    const res = run();
    const f = projectFit(res.results.get(SINGER)!, res);
    expect(f.fits).toBe(true);
    expect(f.requiredAcres).toBeCloseTo(35.714, 2);
    expect(f.usableAcres).toBeCloseTo(36.2, 1);
    expect(f.margin!).toBeCloseTo(f.usableAcres! - f.requiredAcres, 9);
    expect(f.margin!).toBeGreaterThan(0);
    expect(f.shortfall).toBeNull();
  });
  it("insufficient acreage: shortfall and the actual exclusion reason", () => {
    const res = run({ targetMwAc: 20 });
    const r = res.results.get(SINGER)!;
    const f = projectFit(r, res);
    expect(f.fits).toBe(false);
    expect(f.requiredAcres).toBeCloseTo(71.43, 2);
    expect(f.shortfall!).toBeCloseTo(35.2, 1);
    expect(f.margin).toBeNull();
    expect(r.screenReason).toBe("too_small");
    expect(exclusionText(r.screenReason, res, byId.get(SINGER)!)).toBe("Not enough usable land for a 20 MW AC project.");
  });
  it("exact acreage threshold fits with zero margin", () => {
    const key = usableKey(10, true);
    const req = run().requiredAcres;
    const exact: CandidateProps = { ...byId.get(SINGER)!, site_id: "TEST-EXACT", [key]: req };
    const below: CandidateProps = { ...byId.get(SINGER)!, site_id: "TEST-BELOW", [key]: req - 1e-9 };
    const res = computeScenario([...props, exact, below], meta, DEFAULT_SCENARIO);
    const fe = projectFit(res.results.get("TEST-EXACT")!, res);
    expect(fe.fits).toBe(true);
    expect(fe.margin).toBe(0);
    expect(projectFit(res.results.get("TEST-BELOW")!, res).fits).toBe(false);
  });
  it("missing usable land stays missing (never 0)", () => {
    const key = usableKey(10, true);
    const res = computeScenario([{ ...byId.get(SINGER)!, site_id: "TEST-NULL", [key]: null }], meta, DEFAULT_SCENARIO);
    const f = projectFit(res.results.get("TEST-NULL")!, res);
    expect(f).toMatchObject({ fits: false, usableAcres: null, margin: null, shortfall: null });
  });
});

describe("Pareto explanation", () => {
  it("frontier candidate has no dominator and a non-superlative explanation", () => {
    const res = run();
    expect(res.results.get(SINGER)!.uiState).toBe("frontier");
    expect(explainDominance(SINGER, res, byId)).toBeNull();
    expect(FRONTIER_EXPLANATION).not.toMatch(/best|optimal|recommend|score/i);
  });
  it("dominated candidate: correct dominator and objective differences", () => {
    const res = run();
    const e = explainDominance(CAROLINA, res, byId)!;
    expect(e.dominatorId).toBe(SINGER);
    const [g, t] = e.comparisons;
    expect(g.advantage).toBeCloseTo(byId.get(CAROLINA)!.grid_line_distance_km! - byId.get(SINGER)!.grid_line_distance_km!, 12);
    expect(g.text).toBe("0.03 km closer to mapped ≥69 kV transmission (0.03 km vs 0.06 km from site boundary)");
    expect(t.text).toBe("0.34° flatter on usable land (0.42° vs 0.76°)");
  });
  it("zero-distance tie stays a tie and is worded as intersection", () => {
    const e = explainDominance(SCHLAGE, run(), byId)!;
    expect(e.dominatorId).toBe(WESTPOINT);
    expect(e.comparisons[0].relation).toBe("equal");
    expect(e.comparisons[0].text).toBe("tied on transmission: mapped ≥69 kV transmission intersects both site boundaries");
  });
});

describe("A/B comparison interpretation", () => {
  it("frontier vs frontier: neither dominates; each wins one objective", () => {
    const res = run();
    const c = compareSites(SINGER, WESTPOINT, res, byId);
    expect(c.kind).toBe("tradeoff");
    expect(c.bothFrontier).toBe(true);
    const winners = c.objectives.map((o) => o.winner).sort();
    expect(winners).toEqual(["A", "B"]);
    // WestPoint intersects a line (0 km); Singer is flatter
    expect(c.objectives[0]).toMatchObject({ kind: "grid", winner: "B", b: 0 });
    expect(c.objectives[1]).toMatchObject({ kind: "terrain", winner: "A" });
    expect(choiceSentence(c)).toMatch(/^Choosing A instead of B gains .* of flatter usable land but gives up .* of transmission proximity\./);
  });
  it("dominator vs dominated", () => {
    const res = run();
    const c = compareSites(SINGER, CAROLINA, res, byId);
    expect(c.kind).toBe("A_dominates");
    expect(c.objectives.every((o) => o.winner === "A")).toBe(true);
    expect(choiceSentence(c)).toBe(
      "Choosing B instead of A gives up 0.03 km of transmission proximity and 0.34° of flatter usable land, with no gain on either active objective.");
    // order-independent
    expect(compareSites(CAROLINA, SINGER, res, byId).kind).toBe("B_dominates");
  });
  it("dominance with a tie names the tied objective", () => {
    const c = compareSites(WESTPOINT, SCHLAGE, run(), byId);
    expect(c.kind).toBe("A_dominates");
    expect(choiceSentence(c)).toMatch(/\(tied on grid proximity\), with no gain/);
  });
  it("feasible vs infeasible is not comparable and reports both fits", () => {
    const res = run({ targetMwAc: 20 });
    const c = compareSites(SINGER, WESTPOINT, res, byId);
    expect(c.kind).toBe("not_comparable");
    expect(c.fitA.fits).toBe(false);
    expect(c.fitA.shortfall!).toBeCloseTo(35.2, 1);
    expect(c.fitB.fits).toBe(true);
    expect(c.fitB.margin!).toBeGreaterThan(0);
    expect(choiceSentence(c)).toBeNull();
  });
  it("the same A/B pair is re-evaluated after a project-size change", () => {
    const at10 = compareSites(SINGER, WESTPOINT, run(), byId);
    const at20 = compareSites(SINGER, WESTPOINT, run({ targetMwAc: 20 }), byId);
    expect(at10.kind).toBe("tradeoff");
    expect(at20.kind).toBe("not_comparable");
    const res20 = run({ targetMwAc: 20 });
    expect(compareSites(WESTPOINT, MAXTON, res20, byId).bothFrontier).toBe(true);
  });
});

describe("grid formatting", () => {
  it("0 → intersects, positive → from site boundary, null → missing", () => {
    expect(fmtGridValue(0)).toBe("Intersects site boundary");
    expect(fmtGridValue(1.4243)).toBe("1.4 km from site boundary");
    expect(fmtGridValue(0.42)).toBe("0.42 km from site boundary");
    expect(fmtGridValue(null)).toBe("Not available");
  });
});

describe("compare + selection state (store)", () => {
  beforeEach(() => {
    useApp.setState({ compare: { A: null, B: null }, selectedId: null, scenario: DEFAULT_SCENARIO, bottomTab: "tradeoffs" });
  });
  const st = () => useApp.getState();
  it("add A, add B, full is a no-op, remove keeps letters stable", () => {
    st().addToCompare(SINGER);
    expect(st().compare).toEqual({ A: SINGER, B: null });
    st().addToCompare(CAROLINA);
    expect(st().compare).toEqual({ A: SINGER, B: CAROLINA });
    st().addToCompare(WESTPOINT);
    expect(st().compare).toEqual({ A: SINGER, B: CAROLINA });
    st().addToCompare(SINGER);
    expect(st().compare).toEqual({ A: SINGER, B: CAROLINA });
    st().removeFromCompare(SINGER);
    expect(st().compare).toEqual({ A: null, B: CAROLINA });
    st().addToCompare(WESTPOINT);
    expect(st().compare).toEqual({ A: WESTPOINT, B: CAROLINA });
    st().toggleCompare(CAROLINA);
    expect(st().compare).toEqual({ A: WESTPOINT, B: null });
  });
  it("membership is explicit: selecting sites never changes Compare", () => {
    st().addToCompare(SINGER);
    st().select(CAROLINA);
    st().select(WESTPOINT, { fly: true });
    st().select(null);
    expect(st().compare).toEqual({ A: SINGER, B: null });
  });
  it("compare with dominator: one action sets A = dominator, B = site, opens Compare", () => {
    st().addToCompare(WESTPOINT);
    st().compareWithDominator(CAROLINA, SINGER);
    expect(st().compare).toEqual({ A: SINGER, B: CAROLINA });
    expect(st().bottomTab).toBe("compare");
    expect(st().bottomOpen).toBe(true);
  });
  it("selection and Compare survive a project-size change", () => {
    st().select(SINGER);
    st().compareWithDominator(CAROLINA, SINGER);
    st().setScenario({ targetMwAc: 20 });
    expect(st().selectedId).toBe(SINGER);
    expect(st().compare).toEqual({ A: SINGER, B: CAROLINA });
    expect(st().scenario.targetMwAc).toBe(20);
  });
});
