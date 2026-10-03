"use client";
import { useScenarioResult } from "@/lib/data/load";
import { useApp } from "@/store/app-store";
import { CANDIDATE_SETS } from "@/lib/scenario/scenario";
import { InfoTip } from "@/components/ui/primitives";
import { StatusGlyph } from "@/components/shared/status";
import { fmtMwShort } from "@/lib/formatting/format";

const BASELINE_TIP: Record<string, string> = {
  brownfields_baseline:
    "NC DEQ brownfield project polygons ≥ 10 acres, minus sites where building footprints cover ≥ 25% of the boundary and sites with solar already mapped or registered (EIA-860). DEQ program status is shown but not interpreted.",
  landfills_secondary:
    "Mapped landfill footprints whose matched NC landfill records (via EPA RE-Powering) are all closed / pre-regulatory, or mixed closed and open units.",
  quarries_exploratory: "Mapped quarry footprints tagged abandoned, disused or former in OpenStreetMap.",
};

function Row({ n, total, label, tip, accent, glyph }: {
  n: number; total: number; label: React.ReactNode; tip?: string; accent?: string; glyph?: React.ReactNode;
}) {
  const w = total > 0 ? Math.max(n > 0 ? 2 : 0, (n / total) * 100) : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline gap-2.5">
        {/* key forces a brief fade when the value changes */}
        <span key={n} className="w-12 text-right font-mono text-[20px] font-medium leading-[26px] tabular-nums text-text-primary animate-[fadein_160ms_ease-out]">
          {n}
        </span>
        <span className="flex flex-1 items-center gap-1.5 text-[13px] text-text-secondary">
          {glyph}{label}
          {tip && <InfoTip label="What this stage means" content={tip} />}
        </span>
      </div>
      <div className="ml-[58px] h-1 rounded-full bg-surface-sunken">
        <div className="h-1 rounded-full transition-[width] duration-300" style={{ width: `${w}%`, background: accent ?? "var(--border-strong)" }} />
      </div>
    </li>
  );
}

export function CandidateFunnel() {
  const res = useScenarioResult();
  const set = useApp((s) => s.scenario.candidateSet);
  if (!res) return null;
  const f = res.funnel;
  const meta = CANDIDATE_SETS[set];
  const capsOn = res.scenario.maxGridKm !== null || res.scenario.maxNwiPct !== null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="funnel-h" className="section-title">Candidates</h2>
        {meta.exploratory && (
          <span className="rounded-sm border border-warning/40 px-1.5 text-[11px] font-medium text-warning">Exploratory</span>
        )}
      </div>
      <ol className="space-y-2.5" aria-label="Candidate funnel">
        <Row n={f.universe} total={f.universe} label={meta.universeLabel} tip={set === "brownfields_baseline" ? "NC DEQ Brownfields Program project polygons of at least 10 gross acres." : undefined} />
        <Row n={f.baseline} total={f.universe} label="Pass baseline land screen" tip={BASELINE_TIP[set]} />
        <Row n={f.sizeFeasible} total={f.universe} label={`Fit your ${fmtMwShort(res.scenario.targetMwAc)} MW project`}
          tip={`Usable land (slope ≤ ${res.scenario.slopeThresholdPct}% grade, minus buildings, water${res.scenario.excludeNwi ? " and NWI-mapped wetland" : ""}) of at least ${res.requiredAcres.toFixed(1)} acres.`} />
        {capsOn && <Row n={f.screenEligible} total={f.universe} label="Within your filters" />}
        <Row n={f.frontier} total={f.universe} label="Pareto frontier" accent="var(--pareto-frontier)"
          glyph={<StatusGlyph state="frontier" />}
          tip="Feasible sites for which no other feasible site is both closer to mapped transmission and flatter on usable land." />
      </ol>
      <p className="ml-[58px] flex items-center gap-1.5 text-[13px] text-text-secondary">
        <StatusGlyph state="alternative" />
        <span><span className="font-mono text-text-primary">{f.alternatives}</span> strong alternatives</span>
        <InfoTip label="About strong alternatives" content="Sites that would join the frontier if the frontier sites ahead of them were unavailable (Pareto layers 2–3). Not a ranking." />
      </p>
    </div>
  );
}
