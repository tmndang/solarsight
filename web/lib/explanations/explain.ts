/**
 * Deterministic dominance explanations from the active objectives only (no free text generation).
 * Mirrors the comparison semantics of src/analysis/pareto.py ParetoResult.compare().
 */
import type { CandidateProps } from "@/lib/data/schema";
import type { ScenarioResult } from "@/lib/scenario/scenario";
import { fmtKm } from "@/lib/formatting/format";

/** Explanations compare small differences: always 2 dp in degrees so 0.34° is not shown as 0.3°. */
const fmtDeg2 = (v: number) => v.toFixed(2) + "°";

export type Relation = "better" | "equal" | "worse";

export interface ObjectiveComparison {
  key: string;
  /** dominator's value and this site's value (raw units) */
  dominatorValue: number;
  siteValue: number;
  /** positive = dominator is better by this much (raw units, minimise objectives) */
  advantage: number;
  relation: Relation;
  /** human sentence fragment, e.g. "0.03 km closer to mapped transmission (0.03 vs 0.06 km)" */
  text: string;
}

export interface DominanceExplanation {
  dominatorId: string;
  comparisons: ObjectiveComparison[];
}

const PHRASES: Record<string, { better: string; same: string; fmt: (v: number) => string; unit: string }> = {
  grid_line_distance_km: { better: "closer to mapped ≥69 kV transmission", same: "the same distance to mapped transmission", fmt: fmtKm, unit: "km" },
  terrain: { better: "flatter on usable land", same: "the same mean slope of usable land", fmt: fmtDeg2, unit: "°" },
};

function phraseFor(key: string) {
  return key.startsWith("usable_mean_slope_deg") ? PHRASES.terrain : PHRASES[key];
}

/** Format a positive difference; if it would display as 0, say "slightly" honestly. */
function fmtAdvantage(adv: number, key: string): string {
  const p = phraseFor(key);
  const shown = p.fmt(adv);
  const zeroShown = Number.parseFloat(shown) === 0;
  return zeroShown ? `slightly ${p.better} (< ${p.unit === "km" ? "0.01 km" : "0.01°"})` : `${shown} ${p.better}`;
}

/**
 * Transmission wording treats 0 as a geometric state (a mapped ≥69 kV line intersects the site boundary),
 * not "0.00 km". Ties at 0 remain ties — the Pareto comparison itself is unchanged.
 */
function gridText(relation: Relation, a: number, b: number, advantage: number): string {
  if (relation === "equal") {
    return a === 0 ? "a mapped ≥69 kV line intersecting its boundary, as does this site"
      : `the same distance to mapped transmission (both ${fmtKm(a)})`;
  }
  if (relation === "better" && a === 0) return `a mapped ≥69 kV line intersecting its boundary (this site: ${fmtKm(b)} away)`;
  if (relation === "better") return `${fmtAdvantage(advantage, "grid_line_distance_km")} (${fmtKm(a)} vs ${fmtKm(b)})`;
  return b === 0 ? `${fmtKm(a)} vs a line intersecting this site's boundary` : `${fmtKm(a)} vs ${fmtKm(b)}`;
}

export function compareOnObjectives(dom: CandidateProps, site: CandidateProps, keys: string[]): ObjectiveComparison[] {
  return keys.map((key) => {
    const a = dom[key as keyof CandidateProps] as number;
    const b = site[key as keyof CandidateProps] as number;
    const advantage = b - a; // minimise: lower dominator value = advantage
    const relation: Relation = advantage > 0 ? "better" : advantage < 0 ? "worse" : "equal";
    const p = phraseFor(key);
    const text = key === "grid_line_distance_km" ? gridText(relation, a, b, advantage)
      : relation === "better"
        ? `${fmtAdvantage(advantage, key)} (${p.fmt(a)} vs ${p.fmt(b)})`
        : relation === "equal" ? `${p.same} (both ${p.fmt(a)})` : `${p.fmt(a)} vs ${p.fmt(b)}`;
    return { key, dominatorValue: a, siteValue: b, advantage, relation, text };
  });
}

export function explainDominance(siteId: string, res: ScenarioResult,
  byId: Map<string, CandidateProps>): DominanceExplanation | null {
  const r = res.results.get(siteId);
  if (!r || !r.screenEligible || !r.exampleDominator) return null;
  const dom = byId.get(r.exampleDominator)!;
  const site = byId.get(siteId)!;
  return { dominatorId: dom.site_id, comparisons: compareOnObjectives(dom, site, res.objectives.map((o) => o.key)) };
}
