"use client";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { STATE_LABEL, StatusGlyph } from "@/components/shared/status";
import { GRID_INTERSECTS, fmtAc, fmtDeg, fmtKm, fmtMwShort } from "@/lib/formatting/format";

/** Just enough to decide whether to click (UI_SPEC §13). */
export function MapHoverCard({ id, x, y }: { id: string; x: number; y: number }) {
  const c = useApp((s) => s.data.byId.get(id));
  const res = useScenarioResult();
  if (!c || !res) return null;
  const r = res.results.get(id)!;
  const slope = c[res.terrainKey];
  const mw = fmtMwShort(res.scenario.targetMwAc);
  const flip = x > 260;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 w-[244px] rounded-md border border-border bg-surface-raised px-3 py-2.5 shadow-[var(--shadow-raised)]"
      style={{ left: flip ? x - 256 : x + 12, top: Math.max(8, y - 12) }}
    >
      <p className="truncate text-[13px] font-semibold text-text-primary">{c.name}</p>
      <p className="meta-text">{c.county} Co.</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-primary">
        <StatusGlyph state={r.uiState} size={11} />
        {r.uiState === "screened" ? screenedLabel(r.screenReason) : STATE_LABEL[r.uiState]}
      </p>
      <dl className="mt-1.5 space-y-0.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">{r.sizeFeasible ? `Fits ${mw} MW AC` : `Doesn't fit ${mw} MW AC`}</dt>
          <dd className="font-mono text-text-primary">{r.usableAcres !== null ? `${fmtAc(r.usableAcres)} / ${res.requiredAcres.toFixed(1)}` : "—"}</dd>
        </div>
        {c.grid_line_distance_km === 0 ? (
          <div>
            <dt className="sr-only">Mapped ≥69 kV line</dt>
            <dd className="text-text-primary">{GRID_INTERSECTS}</dd>
          </div>
        ) : (
          <div className="flex justify-between gap-2">
            <dt className="text-text-secondary">Mapped ≥69 kV line</dt>
            <dd className="font-mono text-text-primary">{c.grid_line_distance_km !== null ? fmtKm(c.grid_line_distance_km) : "not available"}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Mean usable slope</dt>
          <dd className="font-mono text-text-primary">{slope !== null ? fmtDeg(slope) : "not available"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function screenedLabel(reason: string | null): string {
  switch (reason) {
    case "too_small": return "Doesn't fit this project";
    case "baseline": return "Screened out (baseline land screen)";
    case "not_in_set": return "Not in this candidate set";
    case "missing_metric": return "Screened out (metric unavailable)";
    case "grid_cap": return "Outside your transmission filter";
    case "nwi_cap": return "Outside your NWI filter";
    default: return "Screened out";
  }
}
