"use client";
import { TooltipProvider } from "@/components/ui/primitives";
import { useApp } from "@/store/app-store";
import { AppHeader } from "./app-header";
import { DataGate } from "./data-gate";
import { ScenarioSummary } from "./scenario-summary";
import { ScreeningRail } from "@/components/controls/screening-rail";
import { SiteEmptyState } from "@/components/site/site-empty-state";

export function SolarSightApp() {
  return (
    <TooltipProvider>
      <DataGate>
        <Workspace />
      </DataGate>
    </TooltipProvider>
  );
}

function Workspace() {
  const setMethodologyOpen = useApp((s) => s.setMethodologyOpen);
  return (
    <div className="grid h-dvh grid-rows-[56px_minmax(0,1fr)] bg-background">
      <AppHeader summary={<ScenarioSummary />} onMethodology={() => setMethodologyOpen(true)} />
      <main className="grid min-h-0 grid-cols-[340px_minmax(0,1fr)_400px] max-[1279px]:grid-cols-[300px_minmax(0,1fr)]">
        <aside aria-label="Project and screening" className="min-h-0 overflow-y-auto border-r border-border bg-surface">
          <ScreeningRail />
        </aside>
        <section aria-label="Map and tradeoffs" className="grid min-h-0 grid-rows-[minmax(0,1fr)_280px]">
          <div className="relative min-h-0 bg-surface-sunken" />
          <div className="border-t border-border bg-surface" />
        </section>
        <aside aria-label="Selected site" className="min-h-0 overflow-y-auto border-l border-border bg-surface max-[1279px]:hidden">
          <SiteEmptyState />
        </aside>
      </main>
    </div>
  );
}
