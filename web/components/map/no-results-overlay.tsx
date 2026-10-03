"use client";
import { useMemo } from "react";
import { SearchX } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { computeScenario, CANDIDATE_SETS, type Scenario } from "@/lib/scenario/scenario";
import { Button } from "@/components/ui/primitives";
import { fmtMwShort } from "@/lib/formatting/format";

/**
 * Shown when no candidate passes the current requirements. Suggestions are evaluated, never
 * applied automatically, and only offered if they would actually produce results.
 */
export function NoResultsOverlay() {
  const res = useScenarioResult();
  const props = useApp((s) => s.data.props);
  const meta = useApp((s) => s.data.meta);
  const byId = useApp((s) => s.data.byId);
  const setScenario = useApp((s) => s.setScenario);

  const suggestions = useMemo(() => {
    if (!res || !meta || res.funnel.screenEligible > 0) return [];
    const sc = res.scenario;
    const out: { label: string; patch: Partial<Scenario> }[] = [];
    const tryPatch = (label: string, patch: Partial<Scenario>) => {
      const n = computeScenario(props, meta, { ...sc, ...patch }).funnel.screenEligible;
      if (n > 0) out.push({ label: `${label} → ${n} site${n === 1 ? "" : "s"}`, patch });
    };
    const smaller = [...meta.assumptions.target_sizes_mw_ac].reverse().find((s) => s < sc.targetMwAc && res.largestBaseline && s <= res.largestBaseline.mwAc);
    if (smaller) tryPatch(`Try ${fmtMwShort(smaller)} MW`, { targetMwAc: smaller });
    if (sc.slopeThresholdPct < 15) tryPatch("Allow 15% grade", { slopeThresholdPct: 15 });
    if (sc.excludeNwi) tryPatch("Include NWI-mapped areas", { excludeNwi: false });
    if (sc.maxGridKm !== null) tryPatch("Remove transmission filter", { maxGridKm: null });
    if (sc.maxNwiPct !== null) tryPatch("Remove NWI filter", { maxNwiPct: null });
    return out;
  }, [res, props, meta]);

  if (!res || res.funnel.screenEligible > 0) return null;
  const lb = res.largestBaseline;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div role="status" className="pointer-events-auto max-w-md rounded-[10px] border border-border bg-surface/95 px-5 py-4 shadow-[var(--shadow-raised)]" style={{ animation: "slidein 180ms ease-out" }}>
        <div className="flex items-start gap-3">
          <SearchX size={18} className="mt-0.5 text-text-muted" aria-hidden />
          <div className="space-y-2">
            <p className="text-[14px] font-semibold text-text-primary">
              No {CANDIDATE_SETS[res.scenario.candidateSet].label.toLowerCase()} fit a {fmtMwShort(res.scenario.targetMwAc)} MW AC project under these assumptions.
            </p>
            {lb && (
              <p className="text-[13px] text-text-secondary">
                Largest project any site in this set fits: <span className="font-mono text-text-primary">{lb.mwAc.toFixed(1)} MW AC</span> ({byId.get(lb.id)?.name}).
              </p>
            )}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <Button key={s.label} variant="outline" size="sm" onClick={() => setScenario(s.patch)}>{s.label}</Button>
                ))}
              </div>
            )}
            <p className="meta-text">Nothing changes until you choose an option.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
