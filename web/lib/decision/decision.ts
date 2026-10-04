/**
 * Decision interpretation for the selected-site panel and A/B Compare. Pure functions over a ScenarioResult —
 * nothing here changes feasibility or Pareto results; it only reads them and states what they mean.
 */
import type { CandidateProps } from "@/lib/data/schema";
import type { ScenarioResult, ScreenReason, SiteResult } from "@/lib/scenario/scenario";
import { fmtDeg2, objectiveKind, type ObjectiveKind } from "@/lib/explanations/explain";
import { fmtAc, fmtKm, fmtMwShort } from "@/lib/formatting/format";

/* ---------------- project fit ---------------- */

export interface ProjectFit {
  fits: boolean;
  requiredAcres: number;
  /** null when usable land could not be measured (never 0) */
  usableAcres: number | null;
  /** usable − required, ≥ 0 when the site fits */
  margin: number | null;
  /** required − usable, > 0 when the site is too small */
  shortfall: number | null;
}

export function projectFit(r: SiteResult, res: ScenarioResult): ProjectFit {
  const req = res.requiredAcres;
  const u = r.usableAcres;
  return {
    fits: r.sizeFeasible,
    requiredAcres: req,
    usableAcres: u,
    margin: u !== null && r.sizeFeasible ? u - req : null,
    shortfall: u !== null && !r.sizeFeasible ? req - u : null,
  };
}

export const fmtMargin = (v: number) => `+${fmtAc(v)}`;

/** Why a site is not in the current tradeoff analysis, in project terms. */
export function exclusionText(reason: ScreenReason | null, res: ScenarioResult, c: CandidateProps): string | null {
  const mw = fmtMwShort(res.scenario.targetMwAc);
  switch (reason) {
    case null: return null;
    case "too_small": return `Not enough usable land for a ${mw} MW AC project.`;
    case "baseline": return `Removed by the baseline land screen: ${c.status_reason}.`;
    case "not_in_set": return "Not part of the current candidate type.";
    case "missing_metric": return "A tradeoff metric is not available for this site, so it is not compared.";
    case "grid_cap": return `Farther from mapped transmission than your ${res.scenario.maxGridKm} km limit.`;
    case "nwi_cap": return `NWI-mapped overlap above your ${res.scenario.maxNwiPct}% limit (or not available).`;
  }
}

/* ---------------- A/B comparison ---------------- */

export type Winner = "A" | "B" | "tie";

export interface ObjectiveDiff {
  key: string;
  kind: ObjectiveKind;
  a: number | null;
  b: number | null;
  /** lower is better for both objectives; null when a value is missing */
  winner: Winner | null;
  /** |a − b| in raw units, null when a value is missing */
  diff: number | null;
}

export type ComparisonKind =
  | "A_dominates" | "B_dominates"   // one is at least as good on every objective and strictly better on one
  | "tradeoff"                       // each is strictly better on one objective
  | "identical"                      // equal on every active objective
  | "not_comparable";                // at least one site is not in the current tradeoff analysis

export interface Comparison {
  kind: ComparisonKind;
  objectives: ObjectiveDiff[];
  fitA: ProjectFit;
  fitB: ProjectFit;
  inAnalysisA: boolean;
  inAnalysisB: boolean;
  bothFrontier: boolean;
}

export function compareSites(aId: string, bId: string, res: ScenarioResult, byId: Map<string, CandidateProps>): Comparison {
  const ra = res.results.get(aId)!, rb = res.results.get(bId)!;
  const ca = byId.get(aId)!, cb = byId.get(bId)!;
  const objectives: ObjectiveDiff[] = res.objectives.map((o) => {
    const a = ca[o.key as keyof CandidateProps] as number | null;
    const b = cb[o.key as keyof CandidateProps] as number | null;
    const ok = a !== null && b !== null;
    return { key: o.key, kind: objectiveKind(o.key), a, b,
      winner: ok ? (a < b ? "A" : b < a ? "B" : "tie") : null, diff: ok ? Math.abs(a - b) : null };
  });
  const inAnalysisA = ra.screenEligible, inAnalysisB = rb.screenEligible;
  let kind: ComparisonKind;
  if (!inAnalysisA || !inAnalysisB) kind = "not_comparable";
  else {
    const aWins = objectives.some((o) => o.winner === "A"), bWins = objectives.some((o) => o.winner === "B");
    kind = aWins && bWins ? "tradeoff" : aWins ? "A_dominates" : bWins ? "B_dominates" : "identical";
  }
  return { kind, objectives, fitA: projectFit(ra, res), fitB: projectFit(rb, res), inAnalysisA, inAnalysisB,
    bothFrontier: ra.uiState === "frontier" && rb.uiState === "frontier" };
}

const GAIN_NOUN: Record<ObjectiveKind, string> = { grid: "grid proximity", terrain: "flatter usable terrain" };

/**
 * Plain-language consequence of choosing one site over the other (only for comparable pairs). Uses the actual
 * differences; never calls either site better overall.
 */
export function choiceSentence(cmp: Comparison, names: Record<"A" | "B", string> = { A: "A", B: "B" }): string | null {
  const parts = (who: "A" | "B") => cmp.objectives.filter((o) => o.winner === who && o.diff !== null)
    .map((o) => gainText(o.kind, o.diff!));
  switch (cmp.kind) {
    case "A_dominates": case "B_dominates": {
      const dom = cmp.kind === "A_dominates" ? "A" : "B", sub = dom === "A" ? "B" : "A";
      const tied = cmp.objectives.filter((o) => o.winner === "tie").map((o) => GAIN_NOUN[o.kind]);
      return `Choosing ${names[sub]} instead of ${names[dom]} gives up ${joinAnd(parts(dom))}` +
        `${tied.length ? ` (tied on ${joinAnd(tied)})` : ""}, with no gain on either active objective.`;
    }
    case "tradeoff":
      return `Choosing ${names.A} instead of ${names.B} gains ${joinAnd(parts("A"))} but gives up ${joinAnd(parts("B"))}. Improving one objective requires sacrificing the other.`;
    case "identical": return `${names.A} and ${names.B} have identical values on both active objectives.`;
    default: return null;
  }
}

/** Amount gained on one objective, e.g. "0.03 km of transmission proximity", "0.34° of flatter usable land". */
export function gainText(kind: ObjectiveKind, diff: number): string {
  if (kind === "grid") {
    const s = fmtKm(diff);
    return Number.parseFloat(s) === 0 ? "slightly better transmission proximity (< 0.01 km)" : `${s} of transmission proximity`;
  }
  const s = fmtDeg2(diff);
  return Number.parseFloat(s) === 0 ? "slightly flatter usable land (< 0.01°)" : `${s} of flatter usable land`;
}

function joinAnd(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
