"use client";
import { MousePointerClick } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { StatusGlyph } from "@/components/shared/status";
import { fmtDeg, fmtGridPhrase } from "@/lib/formatting/format";
import type { UiState } from "@/lib/scenario/scenario";

function QuickList({ title, ids, state }: { title: string; ids: string[]; state: UiState }) {
  const byId = useApp((s) => s.data.byId);
  const select = useApp((s) => s.select);
  const hover = useApp((s) => s.hover);
  const res = useScenarioResult();
  if (!res || ids.length === 0) return null;
  const sorted = [...ids].sort((a, b) => (byId.get(a)!.grid_line_distance_km ?? 0) - (byId.get(b)!.grid_line_distance_km ?? 0));
  return (
    <div className="space-y-1">
      <h3 className="section-title px-1">{title} ({ids.length})</h3>
      <ul>
        {sorted.map((id) => {
          const c = byId.get(id)!;
          const slope = c[res.terrainKey];
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => select(id, { fly: true })}
                onMouseEnter={() => hover(id, "list")}
                onMouseLeave={() => hover(null)}
                onFocus={() => hover(id, "list")}
                onBlur={() => hover(null)}
                className="flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left hover:bg-surface-raised"
              >
                <span className="pt-1"><StatusGlyph state={state} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text-primary">{c.name}</span>
                  <span className="meta-text">
                    {c.county} Co. · {c.grid_line_distance_km !== null ? fmtGridPhrase(c.grid_line_distance_km) : "transmission distance not available"} ·{" "}
                    {slope !== null ? fmtDeg(slope) : "—"} usable slope
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SiteEmptyState() {
  const res = useScenarioResult();
  return (
    <div className="space-y-5 px-4 py-5">
      <div className="flex items-start gap-3 rounded-md border border-dashed border-border px-3 py-3">
        <MousePointerClick size={16} className="mt-0.5 text-text-muted" aria-hidden />
        <p className="text-[13px] text-text-secondary">Select a site on the map or the tradeoff chart, or pick one below.</p>
      </div>
      {res && (
        <>
          <QuickList title="Pareto frontier" ids={res.frontierIds} state="frontier" />
          <QuickList title="Strong alternatives" ids={res.alternativeIds} state="alternative" />
        </>
      )}
    </div>
  );
}
