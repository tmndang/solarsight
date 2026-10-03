"use client";
import { TooltipProvider } from "@/components/ui/primitives";
import { AppHeader } from "./app-header";

/** M0 shell: layout regions only (filled in by later milestones). */
export function SolarSightApp() {
  return (
    <TooltipProvider>
      <div className="grid h-dvh grid-rows-[56px_minmax(0,1fr)] bg-background">
        <AppHeader />
        <main className="grid min-h-0 grid-cols-[340px_minmax(0,1fr)_400px] max-[1279px]:grid-cols-[300px_minmax(0,1fr)]">
          <aside aria-label="Project and screening" className="min-h-0 overflow-y-auto border-r border-border bg-surface" />
          <section aria-label="Map and tradeoffs" className="grid min-h-0 grid-rows-[minmax(0,1fr)_280px]">
            <div className="relative min-h-0 bg-surface-sunken" />
            <div className="border-t border-border bg-surface" />
          </section>
          <aside aria-label="Selected site" className="min-h-0 overflow-y-auto border-l border-border bg-surface max-[1279px]:hidden" />
        </main>
      </div>
    </TooltipProvider>
  );
}
