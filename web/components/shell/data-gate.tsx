"use client";
import { useEffect } from "react";
import { useApp } from "@/store/app-store";
import { useLoadData } from "@/lib/data/load";
import { Button } from "@/components/ui/primitives";
import { Logo } from "./app-header";

/** Loads + validates the local dataset once. Never renders a partial UI. */
export function DataGate({ children }: { children: React.ReactNode }) {
  useLoadData();
  const status = useApp((s) => s.data.status);
  const error = useApp((s) => s.data.error);
  // Deep link: ?mw=20&site=DEQ-02005-98-007 (applied once after data load; unknown values ignored)
  useEffect(() => {
    if (status !== "ready") return;
    const q = new URLSearchParams(window.location.search);
    const st = useApp.getState();
    const mw = Number(q.get("mw"));
    if ([5, 10, 20, 40].includes(mw)) st.setScenario({ targetMwAc: mw });
    const site = q.get("site");
    if (site && st.data.byId.has(site)) st.select(site, { fly: true });
  }, [status]);
  if (status === "ready") return <>{children}</>;
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <Logo />
        {status === "loading" ? (
          <p className="text-[13px] text-text-secondary" role="status">Loading candidate sites…</p>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-text-primary">SolarSight couldn&apos;t load its local dataset</p>
            <p className="font-mono text-xs text-danger" role="alert">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
          </>
        )}
      </div>
    </div>
  );
}
