import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { paretoAnalysis, type Objective } from "@/lib/pareto/pareto";
import { parseData, type CandidateProps } from "@/lib/data/schema";
import { computeScenario, requiredUsableAcres, DEFAULT_SCENARIO } from "@/lib/scenario/scenario";
import { compareOnObjectives, explainDominance } from "@/lib/explanations/explain";
import { fmtDeg, fmtKm } from "@/lib/formatting/format";

const MIN2: Objective[] = [{ key: "x", direction: "minimize" }, { key: "y", direction: "minimize" }];
const run = (pts: [string, number, number][], objs = MIN2) =>
  paretoAnalysis(pts.map(([id, x, y]) => ({ id, values: [x, y] })), objs);

describe("pareto (ports of tests/test_pareto.py)", () => {
  it("straightforward dominance + example dominator", () => {
    const r = run([["A", 1, 1], ["B", 2, 2], ["C", 0.5, 3]]);
    expect(r.get("A")!.layer).toBe(1);
    expect(r.get("C")!.layer).toBe(1);
    expect(r.get("B")!.layer).toBe(2);
    expect(r.get("B")!.exampleDominator).toBe("A");
  });
  it("mixed directions", () => {
    const objs: Objective[] = [{ key: "x", direction: "maximize" }, { key: "y", direction: "minimize" }];
    const r = run([["1", 1, 1], ["2", 2, 2]], objs);
    expect(r.get("1")!.layer).toBe(1);
    expect(r.get("2")!.layer).toBe(1);
  });
  it("tie on one objective still dominates if strictly better on the other", () => {
    const r = run([["a", 5, 1], ["b", 5, 2]]);
    expect(r.get("b")!.exampleDominator).toBe("a");
  });
  it("exact duplicates do not dominate each other", () => {
    const r = run([["a", 1, 1], ["b", 1, 1], ["c", 9, 9]]);
    expect(r.get("a")!.layer).toBe(1);
    expect(r.get("b")!.layer).toBe(1);
    expect(r.get("c")!.nDominators).toBe(2);
  });
  it("layers", () => {
    const r = run([["a", 1, 3], ["b", 2, 2], ["c", 3, 1], ["d", 2, 3], ["e", 3, 2]]);
    expect(["a", "b", "c"].map((k) => r.get(k)!.layer)).toEqual([1, 1, 1]);
    expect(r.get("d")!.layer).toBe(2);
    expect(r.get("e")!.layer).toBe(2);
  });
  it("example dominator prefers a frontier member, then most strictly-better objectives, then input order", () => {
    // c is dominated by a (frontier) and b (layer 2) -> a
    expect(run([["a", 1, 1], ["b", 2, 2], ["c", 3, 3]]).get("c")!.exampleDominator).toBe("a");
    // two frontier dominators, both better on both -> first in input order
    expect(run([["p", 0, 2], ["q", 1, 1], ["z", 3, 3]]).get("z")!.exampleDominator).toBe("p");
    // first frontier dominator better on 1 objective, second on 2 -> second
    expect(run([["p", 3, 1], ["q", 1, 2], ["z", 3, 3]]).get("z")!.exampleDominator).toBe("q");
  });
  it("matches brute force on random data", () => {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pts = Array.from({ length: 80 }, (_, i) => [String(i), rnd(), rnd()] as [string, number, number]);
    const r = run(pts);
    for (const [id, x, y] of pts) {
      const dominated = pts.some(([, a, b]) => a <= x && b <= y && (a < x || b < y));
      expect(r.get(id)!.layer === 1).toBe(!dominated);
    }
  });
});

const DATA = join(__dirname, "..", "..", "data", "app");
const { candidates, meta } = parseData(
  JSON.parse(readFileSync(join(DATA, "candidates.geojson"), "utf8")),
  JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8")),
);
const props = candidates.features.map((f) => f.properties);
const byId = new Map(props.map((p) => [p.site_id, p]));

describe("data validation", () => {
  it("rejects numbers encoded as strings", () => {
    const bad = structuredClone(candidates);
    (bad.features[0].properties as unknown as Record<string, unknown>).usable_mean_slope_deg_slope10 = "0.77";
    expect(() => parseData(bad, meta)).toThrow(/usable_mean_slope_deg_slope10/);
  });
  it("keeps missing values as null (never 0)", () => {
    const p = props.find((c) => c.usable_mean_slope_deg_slope10 === null);
    expect(p).toBeDefined();
    expect(props.every((c) => c.fema_flood_overlap_pct === null)).toBe(true);
  });
});

describe("scenario", () => {
  it("required acres uses the Python float expression", () => {
    expect(requiredUsableAcres(10, meta)).toBeCloseTo(35.7142857, 6);
    expect(requiredUsableAcres(20, meta)).toBeCloseTo(71.4285714, 6);
    expect(() => requiredUsableAcres(0, meta)).toThrow();
  });
  it("default 10 MW funnel and frontier", () => {
    const r = computeScenario(props, meta, DEFAULT_SCENARIO);
    expect(r.funnel).toEqual({ universe: 434, baseline: 361, sizeFeasible: 75, screenEligible: 75, frontier: 2, alternatives: 6 });
    expect([...r.frontierIds].sort()).toEqual(["DEQ-02005-98-007", "DEQ-18035-14-083"]);
  });
  it("selected site becoming infeasible at 20 MW keeps a result with reason too_small", () => {
    const r = computeScenario(props, meta, { ...DEFAULT_SCENARIO, targetMwAc: 20 });
    const s = r.results.get("DEQ-02005-98-007")!;
    expect(s.sizeFeasible).toBe(false);
    expect(s.screenReason).toBe("too_small");
    expect(s.uiState).toBe("screened");
    expect(s.usableAcres).toBeCloseTo(36.2, 1);
    expect([...r.frontierIds].sort()).toEqual(["DEQ-18035-14-083", "DEQ-21020-17-078"]);
  });
  it("missing objective -> screened as missing_metric, never ranked", () => {
    const p = props.find((c) => c.usable_mean_slope_deg_slope10 === null)!;
    const r = computeScenario(props, meta, { ...DEFAULT_SCENARIO, targetMwAc: 0.001 });
    const s = r.results.get(p.site_id)!;
    if (s.baseline && s.sizeFeasible) expect(s.screenReason).toBe("missing_metric");
    expect(s.layer).toBeNull();
  });
  it("NWI cap fails sites whose NWI value is missing (never treated as 0)", () => {
    const fake: CandidateProps[] = props.map((p) => ({ ...p }));
    const target = fake.find((p) => p.site_id === "DEQ-02005-98-007")!;
    target.nwi_wetland_overlap_pct = null;
    const r = computeScenario(fake, meta, { ...DEFAULT_SCENARIO, maxNwiPct: 5 });
    expect(r.results.get(target.site_id)!.screenReason).toBe("nwi_cap");
  });
  it("quarries at 20 MW is a real zero-result scenario", () => {
    const r = computeScenario(props, meta, { ...DEFAULT_SCENARIO, candidateSet: "quarries_exploratory", targetMwAc: 20 });
    expect(r.funnel.sizeFeasible).toBe(0);
    expect(r.largestBaseline!.mwAc).toBeCloseTo(17.4, 1);
  });
});

describe("explanations", () => {
  it("Carolina Creosoting is dominated by Singer Site on both objectives at 10 MW", () => {
    const r = computeScenario(props, meta, DEFAULT_SCENARIO);
    const e = explainDominance("DEQ-08020-04-010", r, byId)!;
    expect(e.dominatorId).toBe("DEQ-02005-98-007");
    expect(e.comparisons.map((c) => c.relation)).toEqual(["better", "better"]);
    expect(e.comparisons[0].text).toMatch(/^0\.03 km closer to mapped ≥69 kV transmission \(0\.03 km vs 0\.06 km\)$/);
    expect(e.comparisons[1].text).toMatch(/^0\.3° flatter usable land/);
  });
  it("equal objective is described as the same, not as better", () => {
    const r = computeScenario(props, meta, DEFAULT_SCENARIO);
    const e = explainDominance("DEQ-08001-04-064", r, byId)!; // Schlage Lock vs WestPoint: both 0 km
    expect(e.comparisons[0].relation).toBe("equal");
    expect(e.comparisons[0].text).toMatch(/^the same distance to mapped transmission \(both 0\.00 km\)$/);
  });
  it("tiny differences that round to zero are called 'slightly'", () => {
    const a = { ...props[0], grid_line_distance_km: 0.1, usable_mean_slope_deg_slope10: 1 };
    const b = { ...props[0], grid_line_distance_km: 0.102, usable_mean_slope_deg_slope10: 2 };
    const c = compareOnObjectives(a, b, ["grid_line_distance_km", "usable_mean_slope_deg_slope10"]);
    expect(c[0].text.startsWith("slightly closer")).toBe(true);
  });
  it("frontier sites have no explanation", () => {
    const r = computeScenario(props, meta, DEFAULT_SCENARIO);
    expect(explainDominance("DEQ-02005-98-007", r, byId)).toBeNull();
  });
  it("formatting never invents zeros from rounding semantics", () => {
    expect(fmtKm(0.033)).toBe("0.03 km");
    expect(fmtKm(3.31)).toBe("3.3 km");
    expect(fmtDeg(0.4246)).toBe("0.4°");
  });
});
