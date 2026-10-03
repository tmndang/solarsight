"use client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { fmtMwShort } from "@/lib/formatting/format";
import { TradeoffChart } from "./tradeoff-chart";
import { ComparePanel } from "@/components/compare/compare-panel";

export function BottomPanel() {
  const tab = useApp((s) => s.bottomTab);
  const setTab = useApp((s) => s.setBottomTab);
  const open = useApp((s) => s.bottomOpen);
  const setOpen = useApp((s) => s.setBottomOpen);
  const nCompare = useApp((s) => s.compareIds.length);
  const res = useScenarioResult();
  const f = res?.funnel;
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3">
        <TabsList label="Tradeoff views">
          <TabsTrigger value="tradeoffs">Tradeoffs</TabsTrigger>
          <TabsTrigger value="compare">Compare{nCompare ? ` (${nCompare})` : ""}</TabsTrigger>
        </TabsList>
        {f && res && (
          <p className="min-w-0 flex-1 truncate text-xs text-text-secondary" aria-live="polite">
            <span className="font-mono text-text-primary">{f.screenEligible}</span> sites fit {fmtMwShort(res.scenario.targetMwAc)} MW AC ·
            frontier <span className="font-mono text-text-primary">{f.frontier}</span> · strong alternatives <span className="font-mono text-text-primary">{f.alternatives}</span>
          </p>
        )}
        <Button variant="ghost" size="icon" aria-label={open ? "Collapse tradeoff panel" : "Expand tradeoff panel"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </Button>
      </div>
      {open && (
        <div className="min-h-0 flex-1">
          <TabsContent value="tradeoffs" className="h-full">
            <TradeoffChart />
          </TabsContent>
          <TabsContent value="compare" className="h-full overflow-auto">
            <ComparePanel />
          </TabsContent>
        </div>
      )}
    </Tabs>
  );
}
