"use client";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { CANDIDATE_SETS, type CandidateSetId, type SlopeThreshold } from "@/lib/scenario/scenario";
import { Disclosure, InfoTip, Segmented, Select, Slider, Switch } from "@/components/ui/primitives";
import { fmtAc, fmtMwShort } from "@/lib/formatting/format";
import { CandidateFunnel } from "./candidate-funnel";

const SIZES = [5, 10, 20, 40] as const;

function Field({ label, tip, children, htmlFor }: { label: string; tip?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="metric-label">{label}</label>
        {tip && <InfoTip label={`About: ${label}`} content={tip} />}
      </div>
      {children}
    </div>
  );
}

export function ScreeningRail() {
  const scenario = useApp((s) => s.scenario);
  const setScenario = useApp((s) => s.setScenario);
  const showScreened = useApp((s) => s.showScreened);
  const setShowScreened = useApp((s) => s.setShowScreened);
  const res = useScenarioResult();
  const sizeValue = String(scenario.targetMwAc);

  return (
    <div className="flex min-h-full flex-col">
      <section className="space-y-3 border-b border-border px-4 py-4" aria-labelledby="proj-h">
        <h2 id="proj-h" className="section-title">Your project</h2>
        <Field label="Project size (MW AC)">
          <Segmented
            label="Project size in megawatts AC"
            value={sizeValue}
            onChange={(v) => setScenario({ targetMwAc: Number(v) })}
            options={SIZES.map((s) => ({ value: String(s), label: `${fmtMwShort(s)} MW` }))}
          />
        </Field>
        {res && (
          <p className="meta-text">
            Needs ≥ <span className="font-mono text-text-secondary">{fmtAc(res.requiredAcres)}</span> of usable land
            (0.28 MW AC per usable acre)
          </p>
        )}
      </section>

      <section className="space-y-4 border-b border-border px-4 py-4" aria-labelledby="screen-h">
        <h2 id="screen-h" className="section-title">Screening assumptions</h2>
        <Field
          label="Exclude terrain steeper than"
          tip={<>Percent <b>grade</b> (rise ÷ run). 10% grade ≈ 5.7°. Steeper 10 m pixels are not counted as usable land.
            Site slopes elsewhere are reported in <b>degrees</b>.</>}
        >
          <Segmented
            label="Terrain exclusion threshold, percent grade"
            value={String(scenario.slopeThresholdPct)}
            onChange={(v) => setScenario({ slopeThresholdPct: Number(v) as SlopeThreshold })}
            options={[5, 10, 15].map((t) => ({ value: String(t), label: `${t}% grade` }))}
          />
        </Field>
        <Field
          label="Mapped wetland screening"
          tip="USFWS National Wetlands Inventory (NC imagery largely 1980s). NWI identifies mapped wetland features for screening; it is not a jurisdictional determination."
        >
          <div className="flex items-start gap-2.5">
            <Switch id="nwi" checked={scenario.excludeNwi} onCheckedChange={(v) => setScenario({ excludeNwi: v })} />
            <label htmlFor="nwi" className="text-[13px] leading-5 text-text-primary">Exclude NWI-mapped areas from usable land</label>
          </div>
        </Field>
        <Field label="Candidate set" tip="NC DEQ brownfield projects are the baseline. Landfill and quarry sets come from mapped OpenStreetMap footprints with limited closure evidence and are exploratory.">
          <Select<CandidateSetId>
            label="Candidate set"
            value={scenario.candidateSet}
            onChange={(v) => setScenario({ candidateSet: v })}
            options={(Object.keys(CANDIDATE_SETS) as CandidateSetId[]).map((k) => ({
              value: k, label: CANDIDATE_SETS[k].label, hint: CANDIDATE_SETS[k].exploratory ? "Exploratory" : "Baseline",
            }))}
          />
        </Field>
        <Disclosure title="More filters">
          <div className="space-y-4 pt-1">
            <CapFilter
              id="gridcap" label="Max distance to mapped transmission" unit="km" min={0.5} max={10} step={0.5} def={2}
              value={scenario.maxGridKm} onChange={(v) => setScenario({ maxGridKm: v })}
            />
            <CapFilter
              id="nwicap" label="Max NWI-mapped overlap" unit="%" min={0} max={50} step={1} def={10}
              value={scenario.maxNwiPct} onChange={(v) => setScenario({ maxNwiPct: v })}
            />
            <div className="flex items-center gap-2.5">
              <Switch id="screened" checked={showScreened} onCheckedChange={setShowScreened} />
              <label htmlFor="screened" className="text-[13px] text-text-primary">Show screened-out sites on map</label>
            </div>
          </div>
        </Disclosure>
      </section>

      <section className="flex-1 px-4 py-4" aria-labelledby="funnel-h">
        <CandidateFunnel />
      </section>
    </div>
  );
}

function CapFilter({ id, label, unit, min, max, step, def, value, onChange }: {
  id: string; label: string; unit: string; min: number; max: number; step: number; def: number;
  value: number | null; onChange: (v: number | null) => void;
}) {
  const on = value !== null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <Switch id={id} checked={on} onCheckedChange={(v) => onChange(v ? def : null)} />
        <label htmlFor={id} className="flex-1 text-[13px] text-text-primary">{label}</label>
        <span className="font-mono text-xs text-text-secondary">{on ? `≤ ${value}${unit === "%" ? "%" : " " + unit}` : "off"}</span>
      </div>
      <Slider label={label} disabled={!on} value={value ?? def} min={min} max={max} step={step} onChange={(v) => onChange(v)} />
    </div>
  );
}
