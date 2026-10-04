/**
 * Deterministic dominance explanations from the active objectives only (no free text generation).
 * Mirrors the comparison semantics of src/analysis/pareto.py ParetoResult.compare().
 * Fragments read after "<dominator> is:" — e.g. "0.03 km closer to mapped ≥69 kV transmission (…)".
 */
import type { CandidateProps } from "@/lib/data/schema";
import type { ScenarioResult } from "@/lib/scenario/scenario";
import { fmtGridValue, fmtKm, fmtKmNonZero } from "@/lib/formatting/format";

/** Explanations compare small differences: always 2 dp in degrees so 0.34° is not shown as 0.3°. */
export const fmtDeg2 = (v: number) => v.toFixed(2) + "°";

export const FRONTIER_EXPLANATION =
  "No other feasible candidate is at least as good on both active objectives while being strictly better on one.";
export const DOMINANCE_DEFINITION =
  "is at least as good on every active objective and strictly better on at least one.";

export type Relation = "better" | "equal" | "worse";
export type ObjectiveKind = "grid" | "terrain";

export interface ObjectiveComparison {
  key: string;
  /** dominator's value and this site's value (raw units) */
  dominatorValue: number;
  siteValue: number;
  /** positive = dominator is better by this much (raw units, minimise objectives) */
  advantage: number;
  relation: Relation;
  /** fragment that reads after "<dominator> is:" */
  text: string;
}

export interface DominanceExplanation {
  dominatorId: string;
  comparisons: ObjectiveComparison[];
}

export const objectiveKind = (key: string): ObjectiveKind => (key === "grid_line_distance_km" ? "grid" : "terrain");

export const OBJECTIVE_LABEL: Record<ObjectiveKind, string> = {
  grid: "Mapped ≥69 kV transmission",
  terrain: "Mean usable slope",
};

/** A single value in its own units. Grid distance 0 is a geometric state, not "0.00 km". */
export function objectiveValueText(kind: ObjectiveKind, v: number): string {
  if (kind === "terrain") return fmtDeg2(v);
  return fmtGridValue(v);
}

/** Size of an advantage, e.g. "0.03 km closer to mapped ≥69 kV transmission". Tiny differences say "slightly". */
export function advantageText(kind: ObjectiveKind, adv: number): string {
  if (kind === "grid") {
    const shown = fmtKm(adv);
    return Number.parseFloat(shown) === 0 ? "slightly closer to mapped ≥69 kV transmission (< 0.01 km)"
      : `${shown} closer to mapped ≥69 kV transmission`;
  }
  const shown = fmtDeg2(adv);
  return Number.parseFloat(shown) === 0 ? "slightly flatter on usable land (< 0.01°)" : `${shown} flatter on usable land`;
}

/** Fragment comparing a (better or equal) to b, reading after "<a> is:". */
export function relationText(kind: ObjectiveKind, a: number, b: number): string {
  const adv = b - a;
  if (kind === "grid") {
    if (adv === 0) {
      return a === 0 ? "tied on transmission: mapped ≥69 kV transmission intersects both site boundaries"
        : `tied on transmission (both ${fmtKmNonZero(a)} from site boundary)`;
    }
    if (adv > 0 && a === 0) return `intersected by mapped ≥69 kV transmission (vs ${fmtKmNonZero(b)} from site boundary)`;
    if (adv > 0) return `${advantageText("grid", adv)} (${fmtKmNonZero(a)} vs ${fmtKmNonZero(b)} from site boundary)`;
    return b === 0 ? `${fmtKmNonZero(a)} from site boundary vs intersecting` : `${fmtKmNonZero(a)} vs ${fmtKmNonZero(b)} from site boundary`;
  }
  if (adv === 0) return `tied on mean usable slope (both ${fmtDeg2(a)})`;
  if (adv > 0) return `${advantageText("terrain", adv)} (${fmtDeg2(a)} vs ${fmtDeg2(b)})`;
  return `${fmtDeg2(a)} vs ${fmtDeg2(b)}`;
}

export function compareOnObjectives(dom: CandidateProps, site: CandidateProps, keys: string[]): ObjectiveComparison[] {
  return keys.map((key) => {
    const a = dom[key as keyof CandidateProps] as number;
    const b = site[key as keyof CandidateProps] as number;
    const advantage = b - a; // minimise: lower dominator value = advantage
    const relation: Relation = advantage > 0 ? "better" : advantage < 0 ? "worse" : "equal";
    return { key, dominatorValue: a, siteValue: b, advantage, relation, text: relationText(objectiveKind(key), a, b) };
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
