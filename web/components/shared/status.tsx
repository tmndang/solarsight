"use client";
import type { UiState } from "@/lib/scenario/scenario";
import { cn } from "@/lib/utils";

export const STATE_COLOR: Record<UiState, string> = {
  frontier: "var(--pareto-frontier)",
  alternative: "var(--pareto-alternative)",
  feasible: "var(--candidate-feasible)",
  screened: "var(--candidate-screened)",
};

export const STATE_LABEL: Record<UiState, string> = {
  frontier: "Pareto frontier",
  alternative: "Strong alternative",
  feasible: "Feasible — dominated",
  screened: "Screened out",
};

/** Same glyph language as map/chart/legend: ◆ frontier, ● alternative, • feasible, · screened. */
export function StatusGlyph({ state, size = 12, selected = false }: { state: UiState; size?: number; selected?: boolean }) {
  const c = STATE_COLOR[state];
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {state === "frontier" && <path d="M6 0.8 11.2 6 6 11.2 0.8 6Z" fill={c} stroke="var(--surface)" strokeWidth="1" />}
      {state === "alternative" && <circle cx="6" cy="6" r="4.6" fill={c} stroke="var(--surface)" strokeWidth="1" />}
      {state === "feasible" && <circle cx="6" cy="6" r="3.2" fill={c} />}
      {state === "screened" && <circle cx="6" cy="6" r="2.2" fill="none" stroke="var(--text-muted)" strokeWidth="1.2" />}
      {selected && <circle cx="6" cy="6" r="5.6" fill="none" stroke="var(--selected)" strokeWidth="1" />}
    </svg>
  );
}

export function StatusLine({ state, label, className }: { state: UiState; label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary", className)}>
      <StatusGlyph state={state} />
      {label ?? STATE_LABEL[state]}
    </span>
  );
}

export type SourceKind = "derived" | "epa" | "deq" | "usgs" | "nwi";
const SOURCE: Record<SourceKind, { label: string; color: string }> = {
  derived: { label: "SolarSight analysis", color: "var(--source-derived)" },
  epa: { label: "EPA RE-Powering · historical", color: "var(--source-epa)" },
  deq: { label: "NC DEQ record", color: "var(--source-deq)" },
  usgs: { label: "USGS 3DEP", color: "var(--source-derived)" },
  nwi: { label: "USFWS NWI", color: "var(--source-derived)" },
};
export function SourceBadge({ kind }: { kind: SourceKind }) {
  const s = SOURCE[kind];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border px-1.5 py-px text-[11px] font-medium leading-[14px] text-text-secondary">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}
