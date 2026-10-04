/**
 * Scenario engine — TypeScript port of src/analysis/scenario.py (reference implementation).
 *
 *   universe        site_type in set.types && primary_source == set.source      (funnel display)
 *   baseline        candidate_status in set.statuses && site_type in set.types  (= Python status_eligible)
 *   sizeFeasible    usable acres (slope rule T, NWI switch) >= target_mw_ac / (MWdc/acre / DC:AC)
 *   screenEligible  baseline && sizeFeasible && objectives present && optional caps
 *   Pareto          minimise grid_line_distance_km and usable_mean_slope_deg_slope{T}
 */
import type { CandidateProps, Meta } from "@/lib/data/schema";
import { paretoAnalysis, type Objective } from "@/lib/pareto/pareto";

export type SlopeThreshold = 5 | 10 | 15;
export type CandidateSetId = "brownfields_baseline" | "landfills_secondary" | "quarries_exploratory";

export const CANDIDATE_SETS: Record<CandidateSetId, {
  label: string; universeLabel: string; source: CandidateProps["primary_source"]; exploratory: boolean;
}> = {
  brownfields_baseline: { label: "NC DEQ brownfields", universeLabel: "Brownfield projects", source: "nc_deq_brownfields", exploratory: false },
  landfills_secondary: { label: "Landfills", universeLabel: "Mapped landfills", source: "osm_overture", exploratory: true },
  quarries_exploratory: { label: "Quarries (future reclamation)", universeLabel: "Mapped quarries", source: "osm_overture", exploratory: true },
};

export interface Scenario {
  targetMwAc: number;
  slopeThresholdPct: SlopeThreshold;
  excludeNwi: boolean;
  candidateSet: CandidateSetId;
  maxGridKm: number | null;
  maxNwiPct: number | null;
}

export const DEFAULT_SCENARIO: Scenario = {
  targetMwAc: 10, slopeThresholdPct: 10, excludeNwi: true, candidateSet: "brownfields_baseline",
  maxGridKm: null, maxNwiPct: null,
};

export type UiState = "frontier" | "alternative" | "feasible" | "screened";
export type ScreenReason = "not_in_set" | "baseline" | "too_small" | "missing_metric" | "grid_cap" | "nwi_cap";

export interface SiteResult {
  id: string;
  inUniverse: boolean;
  baseline: boolean;
  sizeFeasible: boolean;
  screenEligible: boolean;
  usableAcres: number | null;
  maxCapacityMwAc: number | null;
  screenReason: ScreenReason | null;
  layer: number | null;
  uiState: UiState;
  exampleDominator: string | null;
}

export interface Funnel {
  universe: number;
  baseline: number;
  sizeFeasible: number;
  screenEligible: number;
  frontier: number;
  alternatives: number;
}

export interface ScenarioResult {
  scenario: Scenario;
  requiredAcres: number;
  objectives: Objective[];
  terrainKey: TerrainKey;
  funnel: Funnel;
  results: Map<string, SiteResult>;
  frontierIds: string[];
  alternativeIds: string[];
  eligibleIds: string[];
  /** largest MW AC any baseline site could host under the current land rules (for no-results help) */
  largestBaseline: { id: string; mwAc: number } | null;
}

export type TerrainKey = `usable_mean_slope_deg_slope${SlopeThreshold}`;
export type UsableKey = `usable_acres_slope${SlopeThreshold}` | `usable_acres_slope${SlopeThreshold}_nwi_not_excluded`;

export const terrainKey = (t: SlopeThreshold): TerrainKey => `usable_mean_slope_deg_slope${t}`;
export const usableKey = (t: SlopeThreshold, excludeNwi: boolean): UsableKey =>
  (excludeNwi ? `usable_acres_slope${t}` : `usable_acres_slope${t}_nwi_not_excluded`) as UsableKey;

export function mwAcPerUsableAcre(meta: Pick<Meta, "assumptions">): number {
  return meta.assumptions.mw_dc_per_usable_acre / meta.assumptions.dc_ac_ratio;
}
/** Same float expression as Python required_usable_acres(): target / (dc_density / dc_ac_ratio). */
export function requiredUsableAcres(targetMwAc: number, meta: Pick<Meta, "assumptions">): number {
  if (!(targetMwAc > 0)) throw new Error("targetMwAc must be positive");
  return targetMwAc / mwAcPerUsableAcre(meta);
}

const isNum = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

export function computeScenario(candidates: CandidateProps[], meta: Meta, sc: Scenario): ScenarioResult {
  const set = meta.scenarios[sc.candidateSet];
  if (!set) throw new Error(`unknown candidate set ${sc.candidateSet}`);
  const source = CANDIDATE_SETS[sc.candidateSet].source;
  const req = requiredUsableAcres(sc.targetMwAc, meta);
  const uKey = usableKey(sc.slopeThresholdPct, sc.excludeNwi);
  const tKey = terrainKey(sc.slopeThresholdPct);
  const objectives: Objective[] = [
    { key: "grid_line_distance_km", direction: "minimize" },
    { key: tKey, direction: "minimize" },
  ];
  const perMwAc = mwAcPerUsableAcre(meta);

  const results = new Map<string, SiteResult>();
  const analysed: { id: string; values: number[] }[] = [];
  let universe = 0, baselineN = 0, sizeN = 0;
  let largest: { id: string; mwAc: number } | null = null;

  for (const c of candidates) {
    const inUniverse = set.site_types.includes(c.site_type) && c.primary_source === source;
    const baseline = set.statuses.includes(c.candidate_status) && set.site_types.includes(c.site_type);
    const usable = c[uKey];
    const sizeFeasible = isNum(usable) && usable >= req; // NaN/null never feasible
    const objVals = objectives.map((o) => c[o.key as keyof CandidateProps] as number | null);
    const complete = objVals.every(isNum);
    let reason: ScreenReason | null = null;
    if (!baseline) reason = inUniverse ? "baseline" : "not_in_set";
    else if (!sizeFeasible) reason = "too_small";
    else if (!complete) reason = "missing_metric";
    else if (sc.maxGridKm !== null && !((c.grid_line_distance_km as number) <= sc.maxGridKm)) reason = "grid_cap";
    else if (sc.maxNwiPct !== null && !(isNum(c.nwi_wetland_overlap_pct) && c.nwi_wetland_overlap_pct <= sc.maxNwiPct)) reason = "nwi_cap";
    const screenEligible = reason === null;
    if (inUniverse) universe++;
    if (baseline) {
      baselineN++;
      if (isNum(usable)) {
        const mw = usable * perMwAc;
        if (!largest || mw > largest.mwAc) largest = { id: c.site_id, mwAc: mw };
      }
    }
    if (baseline && sizeFeasible) sizeN++;
    if (screenEligible) analysed.push({ id: c.site_id, values: objVals as number[] });
    results.set(c.site_id, {
      id: c.site_id, inUniverse, baseline, sizeFeasible, screenEligible,
      usableAcres: isNum(usable) ? usable : null,
      maxCapacityMwAc: isNum(usable) ? usable * perMwAc : null,
      screenReason: reason, layer: null, uiState: "screened", exampleDominator: null,
    });
  }

  const pareto = paretoAnalysis(analysed, objectives);
  const frontierIds: string[] = [];
  const alternativeIds: string[] = [];
  for (const a of analysed) {
    const p = pareto.get(a.id)!;
    const r = results.get(a.id)!;
    r.layer = p.layer;
    r.exampleDominator = p.exampleDominator;
    r.uiState = p.layer === 1 ? "frontier" : p.layer <= 3 ? "alternative" : "feasible";
    if (r.uiState === "frontier") frontierIds.push(a.id);
    if (r.uiState === "alternative") alternativeIds.push(a.id);
  }
  return {
    scenario: sc, requiredAcres: req, objectives, terrainKey: tKey,
    funnel: { universe, baseline: baselineN, sizeFeasible: sizeN, screenEligible: analysed.length,
      frontier: frontierIds.length, alternatives: alternativeIds.length },
    results, frontierIds, alternativeIds, eligibleIds: analysed.map((a) => a.id),
    largestBaseline: largest,
  };
}
