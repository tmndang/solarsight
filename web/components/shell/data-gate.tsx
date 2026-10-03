"use client";
import { useApp } from "@/store/app-store";
import { useLoadData } from "@/lib/data/load";
import { Button } from "@/components/ui/primitives";
import { Logo } from "./app-header";

/** Loads + validates the local dataset once. Never renders a partial UI. */
export function DataGate({ children }: { children: React.ReactNode }) {
  useLoadData();
  const status = useApp((s) => s.data.status);
  const error = useApp((s) => s.data.error);
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
