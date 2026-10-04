"use client";
import { TooltipProvider } from "@/components/ui/primitives";
import { useApp } from "@/store/app-store";
import { AppHeader } from "./app-header";
import { DataGate } from "./data-gate";
import { ScenarioSummary } from "./scenario-summary";
import { ScreeningRail } from "@/components/controls/screening-rail";
import { SitePanel } from "@/components/site/site-panel";
import { BottomPanel } from "@/components/tradeoffs/bottom-panel";
import { MethodologySheet } from "@/components/methodology/methodology-sheet";
import { CompareTray } from "@/components/compare/compare-tray";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, Sheet } from "@/components/ui/primitives";

// MapLibre touches window: load client-only.
const SolarMap = dynamic(() => import("@/components/map/solar-map"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-surface-sunken" aria-label="Loading map" />,
});

export function SolarSightApp() {
  return (
    <TooltipProvider>
      <DataGate>
        <Workspace />
      </DataGate>
    </TooltipProvider>
  );
}

const SIZES = [5, 10, 20, 40];

function Workspace() {
  const setMethodologyOpen = useApp((s) => s.setMethodologyOpen);
  const bottomOpen = useApp((s) => s.bottomOpen);
  const bottomTab = useApp((s) => s.bottomTab);
  const selectedId = useApp((s) => s.selectedId);
  const [setupOpen, setSetupOpen] = useState(false);

  // Keyboard: [ / ] step project size, C toggles the selected site in Compare (ignored while typing / in dialogs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, [role=dialog], [role=listbox], [role=combobox]")) return;
      const st = useApp.getState();
      if (e.key === "[" || e.key === "]") {
        const i = SIZES.indexOf(st.scenario.targetMwAc);
        const j = Math.min(SIZES.length - 1, Math.max(0, (i < 0 ? 1 : i) + (e.key === "]" ? 1 : -1)));
        st.setScenario({ targetMwAc: SIZES[j] });
      } else if ((e.key === "c" || e.key === "C") && st.selectedId) {
        st.toggleCompare(st.selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)] bg-background">
      <AppHeader
        summary={<ScenarioSummary />}
        onMethodology={() => setMethodologyOpen(true)}
        extra={
          <Button variant="outline" size="sm" className="min-[1024px]:hidden" onClick={() => setSetupOpen(true)} aria-label="Open project setup">
            <SlidersHorizontal size={14} aria-hidden /> Setup
          </Button>
        }
      />
      <main className="relative grid min-h-0 grid-cols-[340px_minmax(0,1fr)_400px] max-[1279px]:grid-cols-[300px_minmax(0,1fr)] max-[1023px]:grid-cols-[minmax(0,1fr)]">
        <aside aria-label="Project and screening" className="min-h-0 overflow-y-auto border-r border-border bg-surface max-[1023px]:hidden">
          <ScreeningRail />
        </aside>
        <section aria-label="Map and tradeoffs" className={`grid min-h-0 min-w-0 ${!bottomOpen ? "grid-rows-[minmax(0,1fr)_37px]"
            : bottomTab === "compare" ? "grid-rows-[minmax(0,1fr)_minmax(280px,44%)] max-[1023px]:grid-rows-[minmax(0,1fr)_300px]"
              : "grid-rows-[minmax(0,1fr)_280px] max-[1023px]:grid-rows-[minmax(0,1fr)_230px]"}`}>
          <div className="relative min-h-0 min-w-0 bg-surface-sunken"><SolarMap /><CompareTray /></div>
          <div className="min-h-0 min-w-0 border-t border-border bg-surface"><BottomPanel /></div>
        </section>
        <aside
          aria-label="Selected site"
          className={[
            "min-h-0 overflow-y-auto border-l border-border bg-surface",
            // < 1280: overlay over the map's right edge (stops above the tradeoff/compare panel), only while a site is selected
            "max-[1279px]:absolute max-[1279px]:top-0 max-[1279px]:right-0 max-[1279px]:z-30 max-[1279px]:w-[380px] max-[1279px]:shadow-[var(--shadow-raised)]",
            !bottomOpen ? "max-[1279px]:bottom-[37px]" : bottomTab === "compare" ? "max-[1279px]:bottom-[max(280px,44%)]" : "max-[1279px]:bottom-[280px]",
            // < 1024: bottom overlay
            "max-[1023px]:inset-x-0 max-[1023px]:top-auto max-[1023px]:bottom-0 max-[1023px]:h-[62%] max-[1023px]:w-full max-[1023px]:border-l-0 max-[1023px]:border-t",
            selectedId ? "" : "max-[1279px]:hidden",
          ].join(" ")}
        >
          <SitePanel />
        </aside>
      </main>
      <MethodologySheet />
      <Sheet open={setupOpen} onOpenChange={setSetupOpen} title="Project setup" side="bottom">
        <ScreeningRail />
      </Sheet>
    </div>
  );
}
