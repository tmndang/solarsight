"use client";
import { useApp } from "@/store/app-store";
import { CANDIDATE_SETS } from "@/lib/scenario/scenario";
import { fmtMwShort } from "@/lib/formatting/format";

/** Compact echo of the active project requirements (header). */
export function ScenarioSummary() {
  const s = useApp((st) => st.scenario);
  const parts = [
    `${fmtMwShort(s.targetMwAc)} MW AC`,
    `≤ ${s.slopeThresholdPct}% grade`,
    s.excludeNwi ? "NWI excluded" : "NWI included",
    CANDIDATE_SETS[s.candidateSet].label,
  ];
  if (s.maxGridKm !== null) parts.push(`≤ ${s.maxGridKm} km to line`);
  if (s.maxNwiPct !== null) parts.push(`≤ ${s.maxNwiPct}% NWI`);
  return (
    <div className="hidden justify-center md:flex">
      <p aria-live="polite" aria-label="Active project requirements"
        className="inline-flex max-w-full items-center truncate rounded-md border border-border bg-surface-sunken px-2.5 py-1 text-xs text-text-secondary">
        {parts.map((p, i) => (
          <span key={i} className="whitespace-nowrap">{i > 0 && <span className="px-1.5 text-text-muted">·</span>}{p}</span>
        ))}
      </p>
    </div>
  );
}
