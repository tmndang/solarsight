"use client";
/**
 * A ↔ B comparison (bottom workspace panel). Decision-focused: project fit, the two active objectives, brief
 * environmental/source context, and a deterministic "why they differ" explanation from lib/decision.
 * Everything is recomputed from the current scenario, so the comparison survives project-requirement changes.
 */
import { Check, Map as MapIcon, X } from "lucide-react";
import { COMPARE_SLOTS, useApp, type CompareSlot } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import type { CandidateProps } from "@/lib/data/schema";
import type { ScenarioResult, SiteResult } from "@/lib/scenario/scenario";
import { choiceSentence, compareSites, exclusionText, fmtMargin, projectFit, type Comparison } from "@/lib/decision/decision";
import { DOMINANCE_DEFINITION, OBJECTIVE_LABEL, objectiveKind, objectiveValueText } from "@/lib/explanations/explain";
import { Button } from "@/components/ui/primitives";
import { SourceBadge, StatusGlyph, STATE_LABEL } from "@/components/shared/status";
import { CompareBadge } from "@/components/shared/compare-badge";
import { fmtAc, fmtKmNonZero, fmtMi, fmtMwShort, fmtPct } from "@/lib/formatting/format";

type Site = { slot: CompareSlot; c: CandidateProps; r: SiteResult };

export function ComparePanel() {
  const compare = useApp((s) => s.compare);
  const byId = useApp((s) => s.data.byId);
  const clear = useApp((s) => s.clearCompare);
  const requestFit = useApp((s) => s.requestFit);
  const res = useScenarioResult();
  if (!res) return null;
  const mw = fmtMwShort(res.scenario.targetMwAc);
  const sites: Site[] = COMPARE_SLOTS.flatMap((slot) => {
    const id = compare[slot];
    return id ? [{ slot, c: byId.get(id)!, r: res.results.get(id)! }] : [];
  });
  if (sites.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-text-muted">
        Select a site and choose “Add to Compare”, or use “Compare with …” in its Pareto status, to compare two sites side by side.
      </div>
    );
  }
  const cmp = sites.length === 2 ? compareSites(sites[0].c.site_id, sites[1].c.site_id, res, byId) : null;
  return (
    <div className="@container px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="section-title flex-1">Compare sites · {mw} MW AC project</h3>
        {sites.length === 2 && (
          <Button variant="ghost" size="sm" onClick={() => requestFit(sites.map((s) => s.c.site_id))}>
            <MapIcon size={13} aria-hidden /> Show both on map
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={clear}>Clear</Button>
      </div>
      <div className="grid gap-3 @[640px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <CompareTable sites={sites} res={res} cmp={cmp} />
        {cmp ? <WhyTheyDiffer sites={sites} res={res} cmp={cmp} /> : (
          <div className="flex items-center justify-center self-start rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-text-muted">
            Select another site on the map or chart and choose “Add to Compare”.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- table ---------------- */

function Section({ title, n }: { title: string; n: number }) {
  return (
    <tr><th colSpan={n + 1} scope="colgroup" className="pb-0.5 pt-2.5 text-left"><span className="section-title">{title}</span></th></tr>
  );
}

/** One measure row; `cell(i)` renders column i (A, then B). */
function Row({ label, n, cell, badge, hint }: {
  label: string; n: number; cell: (i: number) => React.ReactNode; badge?: React.ReactNode; hint?: string;
}) {
  return (
    <tr className="border-b border-border/60">
      <th scope="row" title={hint} className="py-1 pr-2 text-left font-normal">
        <span className="metric-label">{label}</span>{badge && <span className="ml-1.5 align-middle">{badge}</span>}
      </th>
      {Array.from({ length: n }, (_, i) => <td key={i} className="py-1 pr-2 text-[13px] tabular-nums text-text-primary">{cell(i)}</td>)}
    </tr>
  );
}

const NA = ({ t = "not available" }: { t?: string }) => <i className="text-xs text-text-muted">{t}</i>;

function CompareTable({ sites, res, cmp }: { sites: Site[]; res: ScenarioResult; cmp: Comparison | null }) {
  const select = useApp((s) => s.select);
  const remove = useApp((s) => s.removeFromCompare);
  const n = sites.length;
  const fits = sites.map(({ r }) => projectFit(r, res));
  const win = (slot: CompareSlot, i: number) => !!cmp && cmp.kind !== "not_comparable" && cmp.objectives[i].winner === slot;
  return (
    <table className="w-full self-start border-collapse text-[13px]">
      <caption className="sr-only">Comparison of sites A and B for a {fmtMwShort(res.scenario.targetMwAc)} MW AC project</caption>
      <thead>
        <tr className="border-b border-border">
          <th className="w-[30%]"><span className="sr-only">Measure</span></th>
          {sites.map(({ slot, c, r }) => (
            <th key={slot} scope="col" className="py-1 pr-2 text-left align-top font-normal">
              <div className="flex items-start gap-1.5">
                <CompareBadge slot={slot} />
                <button type="button" onClick={() => select(c.site_id, { fly: true })}
                  className="min-w-0 text-left text-[13px] font-semibold leading-[18px] text-text-primary hover:underline">{c.name}</button>
                <button type="button" aria-label={`Remove ${c.name} from Compare`} onClick={() => remove(c.site_id)}
                  className="ml-auto rounded p-0.5 text-text-muted hover:text-text-primary"><X size={13} /></button>
              </div>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-text-secondary">
                <StatusGlyph state={r.uiState} size={10} />{r.screenEligible ? STATE_LABEL[r.uiState] : "Not in analysis"}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <Section title="Project fit" n={n} />
        <Row label="Fits project" n={n} cell={(i) => (fits[i].fits
          ? <span className="inline-flex items-center gap-1 font-medium text-success"><Check size={13} aria-hidden />Yes</span>
          : <span className="inline-flex items-center gap-1 font-medium text-danger"><X size={13} aria-hidden />No</span>)} />
        <Row label="Required usable land" n={n} cell={(i) => <span className="font-mono">{fmtAc(fits[i].requiredAcres)}</span>} />
        <Row label="Available usable land" n={n} cell={(i) => {
          const u = fits[i].usableAcres;
          return u === null ? <NA /> : <span className="font-mono">{fmtAc(u)}</span>;
        }} />
        <Row label="Margin / shortfall" n={n} cell={(i) => {
          const f = fits[i];
          return f.margin !== null ? <span className="font-mono text-success">{fmtMargin(f.margin)}</span>
            : f.shortfall !== null ? <span className="font-mono text-danger">{fmtAc(f.shortfall)} short</span> : <NA t="—" />;
        }} />
        <Section title="Active tradeoffs" n={n} />
        {res.objectives.map((o, oi) => {
          const kind = objectiveKind(o.key);
          return (
            <Row key={o.key} label={kind === "grid" ? "Grid proximity" : "Mean usable slope"}
              hint={kind === "grid" ? "Distance from the site boundary to mapped ≥69 kV transmission (0 = a line intersects the boundary)" : undefined}
              n={n} cell={(i) => {
              const { slot, c } = sites[i];
              const v = c[o.key as keyof CandidateProps] as number | null;
              return v === null ? <NA /> : (
                <span className={kind === "grid" && v === 0 ? "" : "font-mono"}>
                  {kind === "grid" ? (v === 0 ? "Intersects" : fmtKmNonZero(v)) : objectiveValueText(kind, v)}
                  {win(slot, oi) && <span className="ml-1 text-success" aria-label="better on this objective">✓</span>}
                </span>
              );
            }} />
          );
        })}
        <Section title="Environmental context" n={n} />
        <Row label="NWI-mapped wetland overlap" n={n} cell={(i) => {
          const c = sites[i].c;
          return c.nwi_data_status === "assessed" && c.nwi_wetland_overlap_pct !== null
            ? <span className="font-mono">{fmtPct(c.nwi_wetland_overlap_pct)}</span> : <NA t="unavailable" />;
        }} />
        <Row label="Flood exposure (FEMA)" n={n} cell={() => <span className="text-xs text-warning">Not assessed</span>} />
        <Section title="Historical screening (not used here)" n={n} />
        <Row label="EPA transmission distance" badge={<SourceBadge kind="epa" />} n={n} cell={(i) => {
          const v = sites[i].c.epa_transmission_distance_miles;
          return v === null ? <NA t="no EPA match" /> : <span className="font-mono text-text-secondary">{fmtMi(v)}</span>;
        }} />
      </tbody>
    </table>
  );
}

/* ---------------- explanation ---------------- */

function ValueLine({ slot, text, ok }: { slot: CompareSlot; text: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px]">
      <CompareBadge slot={slot} size={15} />
      <span className={ok ? "text-text-primary" : "text-text-secondary"}>{text}</span>
      {ok && <span className="text-success" aria-label="better">✓</span>}
    </div>
  );
}

function WhyTheyDiffer({ sites, res, cmp }: { sites: Site[]; res: ScenarioResult; cmp: Comparison }) {
  const byId = useApp((s) => s.data.byId);
  const name = { A: sites[0].c.name, B: sites[1].c.name };
  const mw = fmtMwShort(res.scenario.targetMwAc);
  const box = (title: React.ReactNode, body: React.ReactNode) => (
    <section aria-label="Why they differ" className="self-start rounded-md border border-border bg-surface-sunken/50 px-3 py-2.5">
      <h4 className="section-title mb-1.5 flex items-center gap-1.5">{title}</h4>
      <div className="space-y-2">{body}</div>
    </section>
  );

  if (cmp.kind === "not_comparable") {
    return box("Why they can't be traded off", <>
      {sites.map(({ slot, c, r }) => {
        const f = slot === "A" ? cmp.fitA : cmp.fitB;
        return (
          <div key={slot} className="text-[13px] leading-5">
            <p className="flex items-center gap-1.5 font-medium text-text-primary">
              <CompareBadge slot={slot} size={15} />{c.name}
              <span className={f.fits ? "text-success" : "text-danger"}>{f.fits ? "✓ Fits" : "✕ Doesn't fit"}</span>
            </p>
            <p className="ml-[21px] text-xs text-text-secondary">
              {f.margin !== null && `Required ${fmtAc(f.requiredAcres)}, available ${fmtAc(f.usableAcres!)}, margin ${fmtMargin(f.margin)}. `}
              {f.shortfall !== null && `Required ${fmtAc(f.requiredAcres)}, available ${fmtAc(f.usableAcres!)}, shortfall ${fmtAc(f.shortfall)}. `}
              {!r.screenEligible && r.screenReason !== "too_small" ? exclusionText(r.screenReason, res, c) : ""}
            </p>
          </div>
        );
      })}
      <p className="text-xs text-text-secondary">
        Only sites that fit your {mw} MW AC project are compared on the active objectives, so no dominance or tradeoff is stated.
      </p>
    </>);
  }

  const perObjective = cmp.objectives.map((o) => (
    <div key={o.key}>
      <p className="metric-label mb-0.5">{OBJECTIVE_LABEL[o.kind]}</p>
      <ValueLine slot="A" text={objectiveValueText(o.kind, o.a!)} ok={o.winner === "A"} />
      <ValueLine slot="B" text={objectiveValueText(o.kind, o.b!)} ok={o.winner === "B"} />
      {o.winner === "tie" && <p className="ml-[21px] text-xs text-text-muted">Tied</p>}
    </div>
  ));
  const sentence = <p className="text-[13px] leading-5 text-text-primary">{choiceSentence(cmp, name)}</p>;
  const bothFit = <p className="text-xs text-text-secondary">Both fit your {mw} MW AC project.</p>;

  if (cmp.kind === "A_dominates" || cmp.kind === "B_dominates") {
    const d: CompareSlot = cmp.kind === "A_dominates" ? "A" : "B";
    const other: CompareSlot = d === "A" ? "B" : "A";
    return box(<>Why <CompareBadge slot={d} size={15} /> dominates <CompareBadge slot={other} size={15} /></>, <>
      {perObjective}
      <p className="text-xs text-text-secondary">{name[d]} {DOMINANCE_DEFINITION}</p>
      {sentence}{bothFit}
    </>);
  }
  if (cmp.kind === "identical") return box("Equal on both active objectives", <>{perObjective}{sentence}{bothFit}</>);

  // tradeoff: each is strictly better on one objective
  const verdict = (slot: CompareSlot) => cmp.objectives.map((o) => {
    const better = o.winner === slot;
    const t = o.kind === "grid" ? (better ? "Better grid proximity" : "Farther from mapped transmission")
      : (better ? "Flatter usable terrain" : "Steeper usable terrain");
    return (
      <li key={o.key} className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
        <span aria-hidden className={better ? "text-success" : "text-danger"}>{better ? "✓" : "✕"}</span>
        <span className={better ? "text-text-primary" : "text-text-secondary"}>{t}</span>
        <span className="text-xs text-text-muted">{objectiveValueText(o.kind, (slot === "A" ? o.a : o.b)!)}</span>
      </li>
    );
  });
  const notFrontier = sites.filter(({ r }) => r.uiState !== "frontier");
  return box(cmp.bothFrontier ? "Why both are on the frontier" : "Why neither dominates the other", <>
    <p className="text-[13px] text-text-secondary">Neither candidate dominates the other.</p>
    {sites.map(({ slot, c }) => (
      <div key={slot}>
        <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-text-primary">
          <CompareBadge slot={slot} size={15} />{c.name}
        </p>
        <ul className="ml-[21px] mt-0.5 space-y-0.5">{verdict(slot)}</ul>
      </div>
    ))}
    {sentence}
    {notFrontier.map(({ slot, c, r }) => (
      <p key={slot} className="text-xs text-text-secondary">
        {c.name} is dominated by another site ({byId.get(r.exampleDominator!)?.name}), but not by {name[slot === "A" ? "B" : "A"]}.
      </p>
    ))}
    {bothFit}
  </>);
}
