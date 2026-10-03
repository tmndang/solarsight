"use client";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { StatusGlyph } from "@/components/shared/status";
import type { UiState } from "@/lib/scenario/scenario";

export function MapLegend() {
  const res = useScenarioResult();
  const showScreened = useApp((s) => s.showScreened);
  if (!res) return null;
  const f = res.funnel;
  const other = f.screenEligible - f.frontier - f.alternatives;
  const rows: [UiState, string, number | null][] = [
    ["frontier", "Pareto frontier", f.frontier],
    ["alternative", "Strong alternative", f.alternatives],
    ["feasible", "Other feasible", other],
    ["screened", showScreened ? "Screened out" : "Screened out (hidden)", null],
  ];
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-surface/90 px-3 py-2 backdrop-blur-sm" aria-label="Map legend">
      <ul className="space-y-1">
        {rows.map(([s, label, n]) => (
          <li key={s} className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="flex w-3 justify-center"><StatusGlyph state={s} /></span>
            <span className="flex-1">{label}</span>
            {n !== null && <span className="font-mono text-text-primary">{n}</span>}
          </li>
        ))}
        <li className="flex items-center gap-2 pt-0.5 text-xs text-text-muted">
          <span className="flex w-3 justify-center">
            <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill="none" stroke="var(--selected)" strokeWidth="1.5" /></svg>
          </span>
          Selected
        </li>
      </ul>
    </div>
  );
}
