"use client";
import { X } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import type { CandidateProps } from "@/lib/data/schema";
import type { ScenarioResult, SiteResult } from "@/lib/scenario/scenario";
import { Button } from "@/components/ui/primitives";
import { SourceBadge, StatusGlyph, STATE_LABEL } from "@/components/shared/status";
import { fmtAc, fmtDeg, fmtGridValue, fmtMi, fmtMwShort, fmtPct } from "@/lib/formatting/format";

type Row = {
  label: string;
  /** objective rows get a ◂ on the lower (more favourable) value among the compared sites */
  objective?: (c: CandidateProps, res: ScenarioResult) => number | null;
  cell: (c: CandidateProps, r: SiteResult, res: ScenarioResult) => React.ReactNode;
  historical?: boolean;
};

const MISSING = <span className="text-xs italic text-text-muted">—</span>;

const ROWS: Row[] = [
  {
    label: "Fits your project", cell: (_c, r, res) => r.usableAcres === null ? MISSING : (
      <span className={r.sizeFeasible ? "text-success" : "text-danger"}>
        {r.sizeFeasible ? "Yes" : "No"} <span className="text-text-muted">· {r.usableAcres.toFixed(1)} of {res.requiredAcres.toFixed(1)} ac</span>
      </span>),
  },
  {
    label: "Tradeoff state", cell: (_c, r) => (
      <span className="inline-flex items-center gap-1.5 font-sans"><StatusGlyph state={r.uiState} size={11} />
        {r.screenEligible ? STATE_LABEL[r.uiState] : "Not in analysis"}</span>),
  },
  {
    label: "Mapped ≥69 kV line", objective: (c) => c.grid_line_distance_km,
    cell: (c) => (c.grid_line_distance_km === null ? MISSING : fmtGridValue(c.grid_line_distance_km)),
  },
  {
    label: "Mean slope, usable land", objective: (c, res) => c[res.terrainKey],
    cell: (c, _r, res) => { const v = c[res.terrainKey]; return v === null ? MISSING : fmtDeg(v); },
  },
  { label: "Usable / gross area", cell: (c, r) => `${r.usableAcres === null ? "—" : r.usableAcres.toFixed(1)} / ${fmtAc(c.gross_area_acres)}` },
  { label: "Largest project it fits", cell: (_c, r) => (r.maxCapacityMwAc === null ? MISSING : `${r.maxCapacityMwAc.toFixed(1)} MW AC`) },
  {
    label: "NWI-mapped wetland overlap",
    cell: (c) => (c.nwi_data_status === "assessed" && c.nwi_wetland_overlap_pct !== null ? fmtPct(c.nwi_wetland_overlap_pct) : <span className="text-xs italic text-text-muted">unavailable</span>),
  },
  {
    label: "EPA transmission distance", historical: true,
    cell: (c) => (c.epa_transmission_distance_miles === null ? <span className="text-xs italic text-text-muted">no EPA match</span> : fmtMi(c.epa_transmission_distance_miles)),
  },
  { label: "DEQ program status", cell: (c) => (c.deq_status ? <span className="font-sans">{c.deq_status}</span> : <span className="text-xs italic text-text-muted">not a DEQ record</span>) },
];

export function ComparePanel() {
  const ids = useApp((s) => s.compareIds);
  const byId = useApp((s) => s.data.byId);
  const toggle = useApp((s) => s.toggleCompare);
  const clear = useApp((s) => s.clearCompare);
  const select = useApp((s) => s.select);
  const res = useScenarioResult();
  if (!res) return null;
  if (ids.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-text-muted">
        Add up to three sites with “+ Compare” in the site panel, or “Compare these sites” in a dominance explanation.
      </div>
    );
  }
  const sites = ids.map((id) => ({ c: byId.get(id)!, r: res.results.get(id)! }));
  return (
    <div className="px-3 py-2">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">Comparison of selected sites for a {fmtMwShort(res.scenario.targetMwAc)} MW AC project</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-[200px] py-1.5 text-left">
              <span className="meta-text">For a {fmtMwShort(res.scenario.targetMwAc)} MW AC project</span>
            </th>
            {sites.map(({ c, r }) => (
              <th key={c.site_id} scope="col" className="py-1.5 pr-2 text-left align-top">
                <div className="flex items-start gap-1">
                  <button type="button" onClick={() => select(c.site_id, { fly: true })} className="flex min-w-0 items-center gap-1.5 text-left font-semibold text-text-primary hover:underline">
                    <StatusGlyph state={r.uiState} size={11} /><span className="truncate">{c.name}</span>
                  </button>
                  <button type="button" aria-label={`Remove ${c.name} from comparison`} onClick={() => toggle(c.site_id)} className="ml-auto rounded p-0.5 text-text-muted hover:text-text-primary">
                    <X size={13} />
                  </button>
                </div>
                <span className="meta-text">{c.county} Co.</span>
              </th>
            ))}
            <th className="w-20 text-right"><Button variant="ghost" size="sm" onClick={clear}>Clear</Button></th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const vals = row.objective ? sites.map(({ c }) => row.objective!(c, res)) : null;
            const finite = vals?.filter((v): v is number => v !== null) ?? [];
            const best = finite.length > 1 ? Math.min(...finite) : null;
            const unique = best !== null && finite.filter((v) => v === best).length === 1;
            return (
              <tr key={row.label} className="border-b border-border/60">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  <span className="metric-label">{row.label}</span>
                  {row.historical && <span className="ml-1.5 align-middle"><SourceBadge kind="epa" /></span>}
                </th>
                {sites.map(({ c, r }, i) => (
                  <td key={c.site_id} className={`py-1.5 pr-2 font-mono tabular-nums ${row.historical ? "text-text-secondary" : "text-text-primary"}`}>
                    {row.cell(c, r, res)}
                    {unique && vals![i] === best && <span className="ml-1 text-text-muted" aria-label="more favourable">◂</span>}
                  </td>
                ))}
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="meta-text mt-1.5">◂ marks the lower value on the two tradeoff objectives only. No row is weighted or combined into a score.</p>
    </div>
  );
}
