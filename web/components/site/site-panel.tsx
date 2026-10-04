"use client";
import { useEffect } from "react";
import { ArrowRight, Check, ExternalLink, Map as MapIcon, Plus, X } from "lucide-react";
import { useApp, MAX_COMPARE, compareCount, slotOf } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { explainDominance, fmtDeg2, FRONTIER_EXPLANATION } from "@/lib/explanations/explain";
import { exclusionText, fmtMargin, projectFit } from "@/lib/decision/decision";
import { CompareBadge } from "@/components/shared/compare-badge";
import type { CandidateProps } from "@/lib/data/schema";
import type { ScenarioResult, SiteResult, UiState } from "@/lib/scenario/scenario";
import { Button, Disclosure, InfoTip } from "@/components/ui/primitives";
import { SourceBadge, StatusGlyph } from "@/components/shared/status";
import { GRID_INTERSECTS, fmtAc, fmtDeg, fmtKm, fmtKmNonZero, fmtKv, fmtMi, fmtMwh, fmtMwShort, fmtPct, fmtShare, SITE_TYPE_LABEL } from "@/lib/formatting/format";
import { MetricRow, NotAssessed, SectionHeader } from "./metric";
import { SiteEmptyState } from "./site-empty-state";

export function SitePanel() {
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const methodologyOpen = useApp((s) => s.methodologyOpen);
  const c = useApp((s) => (selectedId ? s.data.byId.get(selectedId) : undefined));
  const res = useScenarioResult();

  // Esc clears the selection (unless a dialog is open; Radix handles Esc there)
  useEffect(() => {
    // capture phase runs before Radix's dialog handler, so an open dialog is still in the DOM here
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !selectedId) return;
      if (methodologyOpen || document.querySelector('[role="dialog"], [role="listbox"]')) return;
      select(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [methodologyOpen, selectedId, select]);

  if (!c || !res) return <SiteEmptyState />;
  const r = res.results.get(c.site_id)!;
  return (
    <article key={c.site_id} aria-label={`Site details: ${c.name}`} className="animate-[slidein_160ms_ease-out]">
      <SiteHeader c={c} />
      <div className="divide-y divide-border">
        <ProjectFit c={c} r={r} res={res} />
        <TradeoffBlock c={c} r={r} res={res} />
        <Analysis c={c} res={res} />
        <div className="px-4 py-1">
          <EpaScreening c={c} />
          <SourceRecord c={c} />
          <ScreeningNotes />
        </div>
      </div>
    </article>
  );
}

/* ---------------- header ---------------- */
function SiteHeader({ c }: { c: CandidateProps }) {
  const select = useApp((s) => s.select);
  const place = [c.city, `${c.county} Co.`].filter(Boolean).join(" · ");
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 pb-3 pt-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold leading-6 text-text-primary">{c.name}</h2>
          <p className="mt-0.5 text-xs text-text-secondary">{place} · {SITE_TYPE_LABEL[c.site_type]}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Clear selection (Esc)" onClick={() => select(null)}><X size={16} /></Button>
      </div>
      <div className="mt-2.5"><CompareAction id={c.site_id} /></div>
    </header>
  );
}

/** Explicit Compare membership: Add to Compare / ✓ In Compare (A|B). Selecting sites never changes it. */
function CompareAction({ id }: { id: string }) {
  const compare = useApp((s) => s.compare);
  const add = useApp((s) => s.addToCompare);
  const remove = useApp((s) => s.removeFromCompare);
  const slot = slotOf(compare, id);
  if (slot) {
    return (
      <Button variant="outline" size="sm" aria-pressed onClick={() => remove(id)} title="Remove from Compare">
        <Check size={13} aria-hidden /> In Compare <CompareBadge slot={slot} size={16} />
      </Button>
    );
  }
  if (compareCount(compare) >= MAX_COMPARE) {
    return (
      <span className="inline-flex items-center gap-2">
        <Button variant="outline" size="sm" disabled><Plus size={13} aria-hidden /> Add to Compare</Button>
        <span className="meta-text">Compare holds two sites. Remove one to add this site.</span>
      </span>
    );
  }
  return (
    <Button variant="outline" size="sm" aria-pressed={false} onClick={() => add(id)}>
      <Plus size={13} aria-hidden /> Add to Compare
    </Button>
  );
}

/* ---------------- project fit ---------------- */
function ProjectFit({ c, r, res }: { c: CandidateProps; r: SiteResult; res: ScenarioResult }) {
  const sc = res.scenario;
  const mw = fmtMwShort(sc.targetMwAc);
  const fit = projectFit(r, res);
  const usableDef = `slope ≤ ${sc.slopeThresholdPct}% grade, minus buildings, surface water${sc.excludeNwi ? " and NWI-mapped wetland" : ""}`;
  const otherReason = r.screenReason !== "too_small" ? exclusionText(r.screenReason, res, c) : null;
  return (
    <section className="px-4 py-3.5" aria-labelledby="fit-h">
      <SectionHeader title={`Your ${mw} MW AC project`} right={<SourceBadge kind="derived" />} />
      <h3 id="fit-h" className="sr-only">Project fit</h3>
      <div role="status" className={`mb-2 rounded-md border px-3 py-2 ${fit.fits ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5"}`}>
        <p className={`flex items-center gap-1.5 text-[13px] font-semibold tracking-wide ${fit.fits ? "text-success" : "text-danger"}`}>
          {fit.fits ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
          {fit.fits ? `FITS YOUR ${mw} MW PROJECT` : `DOESN'T FIT YOUR ${mw} MW PROJECT`}
        </p>
        {!fit.fits && (
          <p className="mt-0.5 text-xs text-text-secondary">
            {fit.usableAcres === null ? "Usable land could not be measured for this site." : exclusionText("too_small", res, c)}
          </p>
        )}
      </div>
      <dl>
        <MetricRow label="Required usable land" value={fmtAc(fit.requiredAcres)} />
        <MetricRow label="Available usable land" tip={<InfoTip label="How usable land is measured" content={`10 m pixels inside the boundary with ${usableDef}.`} />}
          value={fit.usableAcres !== null ? fmtAc(fit.usableAcres) : undefined} missing={fit.usableAcres === null ? "not available" : undefined} />
        {fit.margin !== null && <MetricRow label="Land margin" value={<span className="text-success">{fmtMargin(fit.margin)}</span>} />}
        {fit.shortfall !== null && <MetricRow label="Shortfall" value={<span className="text-danger">{fmtAc(fit.shortfall)}</span>} />}
      </dl>
      {r.maxCapacityMwAc !== null && (
        <p className="meta-text mt-1">Largest project it fits ≈ <span className="font-mono text-text-secondary">{r.maxCapacityMwAc.toFixed(1)} MW AC</span></p>
      )}
      {fit.fits && c.annual_mwh_per_mw_ac !== null && (
        <dl className="mt-1">
          <MetricRow label="Est. generation of this project" value={fmtMwh(sc.targetMwAc * c.annual_mwh_per_mw_ac)}
            tip={<InfoTip label="About estimated generation" content="PVWatts v8 on NSRDB typical-year weather, fixed tilt. Planning estimate; about 10% above observed output of NC fixed-tilt plants. Varies only ~2% between candidate sites. Not a tradeoff objective." />} />
        </dl>
      )}
      {otherReason && <p className="mt-2 text-xs text-text-secondary">{otherReason}</p>}
    </section>
  );
}

/* ---------------- Pareto status / dominance ---------------- */
const STATUS_HEADING: Record<UiState, string> = {
  frontier: "PARETO FRONTIER", alternative: "STRONG ALTERNATIVE", feasible: "FEASIBLE — DOMINATED", screened: "NOT IN THE TRADEOFF ANALYSIS",
};

function ObjectiveValues({ c, res }: { c: CandidateProps; res: ScenarioResult }) {
  const terrain = c[res.terrainKey];
  return (
    <dl className="mt-2">
      <GridDistanceRow c={c} />
      <MetricRow label="Mean usable slope" value={terrain !== null ? fmtDeg2(terrain) : undefined}
        missing={terrain === null ? "not available" : undefined} />
    </dl>
  );
}

function TradeoffBlock({ c, r, res }: { c: CandidateProps; r: SiteResult; res: ScenarioResult }) {
  const byId = useApp((s) => s.data.byId);
  const select = useApp((s) => s.select);
  const compareWithDominator = useApp((s) => s.compareWithDominator);
  const setCompare = useApp((s) => s.setCompare);
  const mw = fmtMwShort(res.scenario.targetMwAc);
  const heading = (
    <p className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-text-primary">
      <StatusGlyph state={r.uiState} />{STATUS_HEADING[r.uiState]}
      {r.uiState === "alternative" && (
        <InfoTip label="About strong alternatives" content="Pareto layers 2–3: it would join the frontier if the sites dominating it were unavailable. Not a ranking." />
      )}
    </p>
  );
  if (!r.screenEligible) {
    return (
      <section className="px-4 py-3.5" aria-label="Pareto status">
        <SectionHeader title="Pareto status" right={<SourceBadge kind="derived" />} />
        {heading}
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">
          Only sites that fit your {mw} MW AC project are compared on the active objectives. {exclusionText(r.screenReason, res, c)}
        </p>
        <ObjectiveValues c={c} res={res} />
      </section>
    );
  }
  if (r.uiState === "frontier") {
    const others = res.frontierIds.filter((id) => id !== c.site_id).slice(0, 2);
    return (
      <section className="px-4 py-3.5" aria-label="Pareto status">
        <SectionHeader title="Pareto status" right={<SourceBadge kind="derived" />} />
        {heading}
        <ObjectiveValues c={c} res={res} />
        <p className="mt-2 text-[13px] leading-5 text-text-secondary">{FRONTIER_EXPLANATION}</p>
        {others.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {others.map((id) => (
              <Button key={id} variant="outline" size="sm" onClick={() => setCompare(c.site_id, id)}>
                Compare with {byId.get(id)!.name} <ArrowRight size={13} aria-hidden />
              </Button>
            ))}
          </div>
        )}
      </section>
    );
  }
  const e = explainDominance(c.site_id, res, byId)!;
  const dom = byId.get(e.dominatorId)!;
  const domState = res.results.get(dom.site_id)!.uiState;
  return (
    <section className="px-4 py-3.5" aria-label="Pareto status">
      <SectionHeader title="Pareto status" right={<SourceBadge kind="derived" />} />
      {heading}
      <ObjectiveValues c={c} res={res} />
      <p className="mt-3 text-xs font-medium tracking-wide text-text-muted">DOMINATED BY</p>
      <button type="button" onClick={() => select(dom.site_id, { fly: true })}
        className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-text-primary underline decoration-border-strong underline-offset-2 hover:decoration-text-secondary">
        <StatusGlyph state={domState} size={11} />{dom.name}
      </button>
      <p className="mt-2 text-xs text-text-muted">{dom.name} is:</p>
      <ul className="mt-1 space-y-1">
        {e.comparisons.map((cmp) => (
          <li key={cmp.key} className="flex gap-2 text-[13px] leading-5 text-text-primary">
            <span aria-hidden className={cmp.relation === "better" ? "text-success" : "text-text-muted"}>{cmp.relation === "better" ? "✓" : "="}</span>
            <span>{cmp.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-secondary">Both fit your {mw} MW AC project.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => compareWithDominator(c.site_id, dom.site_id)}>
        Compare with {dom.name} <ArrowRight size={13} aria-hidden />
      </Button>
    </section>
  );
}

/* ---------------- transmission proximity ---------------- */
const GRID_TIP = "Shortest planar distance from the site polygon boundary to the nearest OpenStreetMap power line tagged ≥ 69 kV; " +
  "0 means a mapped line intersects the boundary. A proximity screening proxy only: it does not indicate interconnection " +
  "capacity, queue position, cost or availability.";

/** grid_line_distance_km === 0 is shown as a geometric statement, never as "0.00 km". */
function GridDistanceRow({ c, detailed = false }: { c: CandidateProps; detailed?: boolean }) {
  const ctx = useApp((s) => s.gridContext);
  const requestFit = useApp((s) => s.requestFit);
  const d = c.grid_line_distance_km;
  const kv = c.nearest_line_kv !== null ? fmtKv(c.nearest_line_kv) : undefined;
  const tip = detailed ? <InfoTip label="About transmission distance" content={GRID_TIP} /> : undefined;
  const row = d === 0 ? (
    <div className="py-1">
      <dt className="sr-only">Mapped ≥69 kV transmission</dt>
      <dd className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[13px] text-text-primary">
          <span aria-hidden className="inline-block h-0.5 w-3 shrink-0 translate-y-[-3px] rounded bg-grid-line" />
          {GRID_INTERSECTS}{tip}
        </span>
        {kv && !detailed && <span className="meta-text shrink-0">{kv}</span>}
      </dd>
    </div>
  ) : (
    <MetricRow label="Mapped ≥69 kV transmission" tip={tip}
      value={d !== null ? fmtKmNonZero(d) : undefined} sub={d !== null ? "from boundary" : undefined}
      missing={d === null ? "not available" : undefined} />
  );
  if (!detailed || d === null) return row;
  const has = ctx.status === "ready" && ctx.bySite.has(c.site_id);
  return (
    <>
      {row}
      <div className="flex items-center justify-between gap-2 pb-1">
        <span className="meta-text">
          {kv ? `Nearest line ${kv}. ` : ""}
          {ctx.status === "loading" ? "Loading line geometry…" : has
            ? (d === 0 ? "Shown over the site on the map." : "Line and shortest distance on the map.")
            : "Line geometry unavailable."}
        </span>
        {has && (
          <Button variant="ghost" size="sm" className="h-6 shrink-0 whitespace-nowrap px-1.5 text-xs" onClick={() => requestFit()}>
            <MapIcon size={12} aria-hidden /> Show on map
          </Button>
        )}
      </div>
    </>
  );
}

/* ---------------- SolarSight analysis ---------------- */
function Analysis({ c, res }: { c: CandidateProps; res: ScenarioResult }) {
  const t = res.scenario.slopeThresholdPct;
  const steep = c[`steep_gt${t}pct_share` as const];
  const terrain = c[res.terrainKey];
  return (
    <section className="px-4 py-3.5" aria-label="SolarSight analysis">
      <SectionHeader title="SolarSight analysis" right={<SourceBadge kind="derived" />} />
      <dl>
        <GridDistanceRow c={c} detailed />
        <MetricRow label="Mapped ≥69 kV substation"
          value={c.substation_distance_km === null ? undefined : c.substation_distance_km === 0 ? "On or within site" : fmtKm(c.substation_distance_km)}
          missing={c.substation_distance_km === null ? "not available" : undefined} />
        <MetricRow label="Mean usable slope" value={terrain !== null ? fmtDeg2(terrain) : undefined}
          missing={terrain === null ? "not available" : undefined} />
        <MetricRow label="Mean / p90 slope, whole site"
          value={c.mean_slope_deg !== null && c.p90_slope_deg !== null ? `${fmtDeg(c.mean_slope_deg)} / ${fmtDeg(c.p90_slope_deg)}` : undefined}
          missing={c.mean_slope_deg === null ? "not available" : undefined} />
        <MetricRow label={`Steeper than ${t}% grade`} value={steep !== null ? fmtShare(steep) : undefined}
          sub="of site" missing={steep === null ? "not available" : undefined} />
        <MetricRow label="Gross area" value={fmtAc(c.gross_area_acres)} />
        <MetricRow label="Building coverage" value={c.building_coverage_pct !== null ? fmtPct(c.building_coverage_pct, 0) : undefined}
          missing={c.building_coverage_pct === null ? "not assessed" : undefined} />
        {c.nwi_data_status === "assessed" && c.nwi_wetland_overlap_pct !== null ? (
          <MetricRow label="NWI-mapped wetland overlap"
            tip={<InfoTip label="About NWI overlap" content={`Share of the mapped project boundary overlapping USFWS National Wetlands Inventory wetland features (${c.nwi_mapping_image_year ? `${c.nwi_mapping_image_year} imagery` : "imagery year unknown"}). Not a jurisdictional determination.`} />}
            value={fmtPct(c.nwi_wetland_overlap_pct)}
            sub={c.nwi_wetland_overlap_acres !== null ? fmtAc(c.nwi_wetland_overlap_acres) : undefined} />
        ) : (
          <MetricRow label="NWI-mapped wetland overlap" missing="NWI analysis unavailable" />
        )}
        <MetricRow label="Mapped surface water" value={c.surface_water_overlap_pct !== null ? fmtPct(c.surface_water_overlap_pct) : undefined}
          missing={c.surface_water_overlap_pct === null ? "not available" : undefined} />
        <NotAssessed label="Flood exposure (FEMA)" text="Not assessed" />
      </dl>
    </section>
  );
}

/* ---------------- EPA historical screening ---------------- */
function EpaScreening({ c }: { c: CandidateProps }) {
  const has = c.epa_cross_reference_number !== null;
  let empty: string | null = null;
  if (!has) {
    if (c.primary_source !== "nc_deq_brownfields") empty = "EPA RE-Powering project matching applies to NC DEQ brownfields only.";
    else if (c.epa_match_method?.startsWith("ambiguous")) empty = "Several EPA records lie inside this boundary; none matched unambiguously, so none is shown.";
    else empty = "No historical EPA RE-Powering match for this project.";
  }
  const conf = c.epa_match_method === "id" ? "exact project ID (high confidence)"
    : c.epa_match_method === "spatial" ? "single EPA point inside the boundary (low confidence)"
      : c.epa_match_method ? `${c.epa_match_method.replace("_", " + ")} (${c.epa_match_confidence})` : "";
  return (
    <Disclosure title="EPA RE-Powering screen" right={<SourceBadge kind="epa" />}>
      {empty ? <p className="text-xs italic text-text-muted">{empty}</p> : (
        <>
          <dl>
            <MetricRow tone="historical" label="Estimated PV (EPA)" tip={<InfoTip label="About EPA PV estimate" content="EPA's estimate: screening acreage ÷ 6.9 acres per MW, gross acreage, AC/DC not stated." />}
              value={c.epa_estimated_pv_capacity_mw !== null ? `${c.epa_estimated_pv_capacity_mw.toFixed(1)} MW` : undefined}
              missing={c.epa_estimated_pv_capacity_mw === null ? "not reported" : undefined} />
            <MetricRow tone="historical" label="Utility-scale PV flag" value={c.epa_utility_scale_pv === "Y" ? "Yes" : "No"} />
            <MetricRow tone="historical" label="Max annual GHI" value={c.epa_max_annual_ghi_kwh_m2_day !== null ? `${c.epa_max_annual_ghi_kwh_m2_day.toFixed(2)} kWh/m²/day` : undefined}
              missing={c.epa_max_annual_ghi_kwh_m2_day === null ? "not reported" : undefined} />
            <MetricRow tone="historical" label="Transmission line" value={c.epa_transmission_distance_miles !== null ? fmtMi(c.epa_transmission_distance_miles) : undefined}
              sub={c.epa_transmission_kv !== null ? fmtKv(c.epa_transmission_kv) : "kV not reported"}
              missing={c.epa_transmission_distance_miles === null ? "not reported" : undefined} />
            <MetricRow tone="historical" label="Substation" value={c.epa_substation_distance_miles !== null ? fmtMi(c.epa_substation_distance_miles) : undefined}
              sub={c.epa_substation_voltage_kv !== null ? fmtKv(c.epa_substation_voltage_kv) : "kV not reported"}
              missing={c.epa_substation_distance_miles === null ? "not reported" : undefined} />
            <MetricRow tone="historical" label="Screening acreage" value={c.epa_screening_acres !== null ? fmtAc(c.epa_screening_acres) : undefined}
              missing={c.epa_screening_acres === null ? "not reported" : undefined} />
          </dl>
          <p className="meta-text mt-1.5">
            Match: {conf}. EPA publishes these records as points, but its NC brownfield transmission distances behave as
            boundary-to-line distances (to EPA&apos;s own historical line layer). SolarSight measures from the current DEQ
            boundary to currently mapped ≥69 kV lines.
            Vintage: as downloaded (EPA documentation dated 2022).
          </p>
        </>
      )}
    </Disclosure>
  );
}

/* ---------------- DEQ / source record ---------------- */
const ALLOWED_USE: Record<string, string> = {
  COM: "Commercial only", IND: "Industrial only", MIX: "Mixed residential & commercial", MRO: "Media restrictions only",
  RES: "Residential only", NONE: "None", "NON REC": "Non-recreational greenspace", INSTNL: "Institutional", "IND & COM": "Industrial & commercial",
};
const MEDIA: Record<string, string> = { MM: "Multi-media", GW: "Groundwater only", IndrAir: "Indoor air only", Soil: "Soil only", SrfWtr: "Surface water" };

function SourceRecord({ c }: { c: CandidateProps }) {
  if (c.primary_source !== "nc_deq_brownfields") {
    return (
      <Disclosure title="Source record" right={<span className="meta-text">OpenStreetMap</span>}>
        <dl>
          <MetricRow label="Mapped feature" value={c.source_id} />
          <MetricRow label="Status evidence" value={<span className="font-sans text-xs text-text-secondary">{c.status_reason}</span>} />
        </dl>
        <p className="meta-text mt-1">A mapped land-use footprint, not an authoritative program record. Operating status is often unknown.</p>
      </Disclosure>
    );
  }
  return (
    <Disclosure title="NC DEQ brownfields record" right={<SourceBadge kind="deq" />}>
      <dl>
        <MetricRow label="Project ID" value={c.source_id} />
        <MetricRow label="Program status (as recorded)" value={c.deq_status ?? undefined} sub={c.deq_status_date ? c.deq_status_date.slice(0, 10) : undefined}
          missing={c.deq_status === null ? "not recorded" : undefined} />
        <MetricRow label="DEQ-reported acreage" value={c.deq_reported_acres !== null ? fmtAc(c.deq_reported_acres) : undefined}
          missing={c.deq_reported_acres === null ? "not recorded" : undefined} />
        {c.deq_allowed_use && <MetricRow label="Allowed use" value={<span className="font-sans text-xs">{ALLOWED_USE[c.deq_allowed_use] ?? c.deq_allowed_use}</span>} />}
        {c.deq_restricted_media && <MetricRow label="Restricted media" value={<span className="font-sans text-xs">{MEDIA[c.deq_restricted_media] ?? c.deq_restricted_media}</span>} />}
        <MetricRow label="Areas of Environmental Concern" missing="not available" />
      </dl>
      {c.deq_docs_link && (
        <a href={c.deq_docs_link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
          DEQ documents <ExternalLink size={11} aria-hidden />
        </a>
      )}
      <p className="meta-text mt-1.5">Program status is shown as recorded by NC DEQ and is not interpreted. A brownfields record does not establish that the property is available for solar development.</p>
    </Disclosure>
  );
}

/* ---------------- notes ---------------- */
function ScreeningNotes() {
  const w = useApp((s) => s.data.meta?.warnings ?? {});
  const order = ["brownfields", "grid", "capacity", "terrain", "wetlands", "flood", "epa", "generation"];
  return (
    <Disclosure title="Screening notes">
      <ul className="space-y-1.5">
        {order.filter((k) => w[k]).map((k) => (
          <li key={k} className="text-xs leading-[18px] text-text-secondary">{w[k]}</li>
        ))}
      </ul>
    </Disclosure>
  );
}
