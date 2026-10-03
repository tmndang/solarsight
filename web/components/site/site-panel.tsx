"use client";
import { useEffect } from "react";
import { ArrowRight, Check, ExternalLink, Plus, X } from "lucide-react";
import { useApp, MAX_COMPARE } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { explainDominance } from "@/lib/explanations/explain";
import type { CandidateProps } from "@/lib/data/schema";
import type { ScenarioResult, SiteResult } from "@/lib/scenario/scenario";
import { Button, Disclosure, InfoTip } from "@/components/ui/primitives";
import { SourceBadge, StatusGlyph, STATE_LABEL } from "@/components/shared/status";
import { screenedLabel } from "@/components/map/map-hover-card";
import { fmtAc, fmtDeg, fmtKm, fmtKv, fmtMi, fmtMwh, fmtMwShort, fmtPct, fmtShare, SITE_TYPE_LABEL } from "@/lib/formatting/format";
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !methodologyOpen && selectedId) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [methodologyOpen, selectedId, select]);

  if (!c || !res) return <SiteEmptyState />;
  const r = res.results.get(c.site_id)!;
  return (
    <article key={c.site_id} aria-label={`Site details: ${c.name}`} className="animate-[slidein_160ms_ease-out]">
      <SiteHeader c={c} r={r} res={res} />
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
function SiteHeader({ c, r, res }: { c: CandidateProps; r: SiteResult; res: ScenarioResult }) {
  const select = useApp((s) => s.select);
  const compareIds = useApp((s) => s.compareIds);
  const toggleCompare = useApp((s) => s.toggleCompare);
  const inCompare = compareIds.includes(c.site_id);
  const place = [c.city, `${c.county} Co.`].filter(Boolean).join(" · ");
  const stateLabel = r.uiState === "screened"
    ? (r.screenReason === "too_small" ? `Doesn't fit your ${fmtMwShort(res.scenario.targetMwAc)} MW project` : screenedLabel(r.screenReason))
    : STATE_LABEL[r.uiState];
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 pb-3 pt-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold leading-6 text-text-primary">{c.name}</h2>
          <p className="mt-0.5 text-xs text-text-secondary">{place} · {SITE_TYPE_LABEL[c.site_type]}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Clear selection (Esc)" onClick={() => select(null)}><X size={16} /></Button>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
          <StatusGlyph state={r.uiState} />
          <span className={r.screenReason === "too_small" ? "text-danger" : undefined}>{stateLabel}</span>
          {r.uiState !== "screened" && (
            <InfoTip label="About this tradeoff state" content={
              r.uiState === "frontier" ? "No other feasible site is both closer to mapped transmission and flatter on usable land."
                : r.uiState === "alternative" ? "Would join the frontier if the sites dominating it were unavailable (Pareto layers 2–3). Not a ranking."
                  : "Another feasible site is at least as good on both objectives and better on one."} />
          )}
        </span>
        <Button variant="outline" size="sm" aria-pressed={inCompare}
          disabled={!inCompare && compareIds.length >= MAX_COMPARE}
          onClick={() => toggleCompare(c.site_id)}>
          {inCompare ? <><Check size={13} aria-hidden /> In compare</> : <><Plus size={13} aria-hidden /> Compare</>}
        </Button>
      </div>
    </header>
  );
}

/* ---------------- project fit ---------------- */
function ProjectFit({ c, r, res }: { c: CandidateProps; r: SiteResult; res: ScenarioResult }) {
  const sc = res.scenario;
  const mw = fmtMwShort(sc.targetMwAc);
  const fits = r.sizeFeasible;
  const usableDef = `slope ≤ ${sc.slopeThresholdPct}% grade, minus buildings, surface water${sc.excludeNwi ? " and NWI-mapped wetland" : ""}`;
  return (
    <section className="px-4 py-3.5" aria-labelledby="fit-h">
      <SectionHeader title={`Your ${mw} MW AC project`} />
      <h3 id="fit-h" className="sr-only">Project fit</h3>
      <dl>
        <MetricRow label="Usable land needed" value={fmtAc(res.requiredAcres)} />
        <MetricRow label="Usable land available" tip={<InfoTip label="How usable land is measured" content={`10 m pixels inside the boundary with ${usableDef}.`} />}
          value={r.usableAcres !== null ? fmtAc(r.usableAcres) : undefined} missing={r.usableAcres === null ? "not available" : undefined} />
        {!fits && r.usableAcres !== null && (
          <MetricRow label="Shortfall" value={fmtAc(res.requiredAcres - r.usableAcres)} />
        )}
      </dl>
      <div role="status" className={`mt-2 rounded-md border px-3 py-2 ${fits ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5"}`}>
        <p className={`text-[13px] font-semibold tracking-wide ${fits ? "text-success" : "text-danger"}`}>
          {fits ? `FITS YOUR ${mw} MW PROJECT` : `DOESN'T FIT YOUR ${mw} MW PROJECT`}
        </p>
        {r.maxCapacityMwAc !== null && (
          <p className="meta-text mt-0.5">Largest project it fits ≈ <span className="font-mono text-text-secondary">{r.maxCapacityMwAc.toFixed(1)} MW AC</span></p>
        )}
      </div>
      {fits && c.annual_mwh_per_mw_ac !== null && (
        <dl className="mt-2">
          <MetricRow label="Est. generation of this project" value={fmtMwh(sc.targetMwAc * c.annual_mwh_per_mw_ac)}
            tip={<InfoTip label="About estimated generation" content="PVWatts v8 on NSRDB typical-year weather, fixed tilt. Planning estimate; about 10% above observed output of NC fixed-tilt plants. Varies only ~2% between candidate sites." />} />
        </dl>
      )}
      {r.screenReason === "baseline" && (
        <p className="mt-2 text-xs text-text-secondary">Screened out by the baseline land screen: {c.status_reason}.</p>
      )}
      {r.screenReason === "not_in_set" && (
        <p className="mt-2 text-xs text-text-secondary">Not part of the current candidate set.</p>
      )}
    </section>
  );
}

/* ---------------- tradeoff position / dominance ---------------- */
function TradeoffBlock({ c, r, res }: { c: CandidateProps; r: SiteResult; res: ScenarioResult }) {
  const byId = useApp((s) => s.data.byId);
  const select = useApp((s) => s.select);
  const addCompare = useApp((s) => s.addCompare);
  const terrain = c[res.terrainKey];
  if (!r.screenEligible) {
    return (
      <section className="px-4 py-3.5">
        <SectionHeader title="Tradeoff position" />
        <p className="text-[13px] text-text-secondary">Not part of the {fmtMwShort(res.scenario.targetMwAc)} MW tradeoff analysis.</p>
      </section>
    );
  }
  const values = (
    <dl className="mt-2">
      <MetricRow label="Mapped ≥69 kV line" value={fmtKm(c.grid_line_distance_km!)} />
      <MetricRow label="Mean slope of usable land" value={fmtDeg(terrain!)} />
    </dl>
  );
  if (r.uiState === "frontier") {
    return (
      <section className="px-4 py-3.5">
        <SectionHeader title="Tradeoff position" />
        <p className="text-[13px] leading-5 text-text-secondary">
          On the frontier: no other site that fits this project is both closer to mapped transmission and flatter on usable land.
        </p>
        {values}
      </section>
    );
  }
  const e = explainDominance(c.site_id, res, byId)!;
  const dom = byId.get(e.dominatorId)!;
  const domState = res.results.get(dom.site_id)!.uiState;
  return (
    <section className="px-4 py-3.5" aria-labelledby="why-h">
      <SectionHeader title="Why this site isn't on the frontier" />
      <h3 id="why-h" className="sr-only">Dominance explanation</h3>
      <p className="text-[13px] text-text-secondary">
        Dominated by{" "}
        <button type="button" onClick={() => select(dom.site_id, { fly: true })}
          className="inline-flex items-center gap-1 font-medium text-text-primary underline decoration-border-strong underline-offset-2 hover:decoration-text-secondary">
          <StatusGlyph state={domState} size={11} />{dom.name}
        </button>
      </p>
      <p className="mt-2 text-xs text-text-muted">Compared with this site, {dom.name} has:</p>
      <ul className="mt-1 space-y-1">
        {e.comparisons.map((cmp) => (
          <li key={cmp.key} className="flex gap-2 text-[13px] leading-5 text-text-primary">
            <span aria-hidden className="text-text-muted">▸</span>
            <span>{cmp.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-secondary">Both fit your {fmtMwShort(res.scenario.targetMwAc)} MW AC project.</p>
      {r.uiState === "alternative" && (
        <p className="mt-1 text-xs text-text-secondary">
          Strong alternative: it would join the frontier if the sites ahead of it were unavailable.
        </p>
      )}
      <Button variant="outline" size="sm" className="mt-3" onClick={() => addCompare([dom.site_id, c.site_id])}>
        Compare these sites <ArrowRight size={13} aria-hidden />
      </Button>
    </section>
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
        <MetricRow label="Mapped ≥69 kV transmission line"
          tip={<InfoTip label="About transmission distance" content="Distance from the site boundary to the nearest OpenStreetMap power line tagged ≥ 69 kV. A screening proxy: it does not indicate interconnection capacity, queue position, cost or availability." />}
          value={c.grid_line_distance_km !== null ? fmtKm(c.grid_line_distance_km) : undefined}
          sub={c.nearest_line_kv !== null ? fmtKv(c.nearest_line_kv) : undefined}
          missing={c.grid_line_distance_km === null ? "not available" : undefined} />
        <MetricRow label="Mapped ≥69 kV substation" value={c.substation_distance_km !== null ? fmtKm(c.substation_distance_km) : undefined}
          missing={c.substation_distance_km === null ? "not available" : undefined} />
        <MetricRow label={`Mean slope, usable land`} value={terrain !== null ? fmtDeg(terrain) : undefined}
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
            Match: {conf}. EPA distances are measured from EPA&apos;s site point to its own historical line layer; SolarSight&apos;s are from the current boundary to mapped ≥69 kV lines.
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
