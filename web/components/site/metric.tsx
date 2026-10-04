"use client";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** One label/value row. Pass `missing` text to render an explicit missing state (never a zero). */
export function MetricRow({ label, value, sub, missing, tone = "primary", tip }: {
  label: React.ReactNode; value?: React.ReactNode; sub?: React.ReactNode; missing?: string;
  tone?: "primary" | "historical"; tip?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="metric-label flex min-w-0 items-center gap-1">{label}{tip}</dt>
      <dd className="text-right">
        {missing !== undefined ? (
          <span className="text-xs italic text-text-muted">{missing}</span>
        ) : (
          <>
            <span className={cn("font-mono text-[13px] tabular-nums", tone === "historical" ? "text-text-secondary" : "text-text-primary")}>{value}</span>
            {sub && <span className="meta-text ml-1.5">{sub}</span>}
          </>
        )}
      </dd>
    </div>
  );
}

export function NotAssessed({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="metric-label">{label}</dt>
      <dd className="flex items-center gap-1 text-xs text-warning">
        <AlertTriangle size={12} aria-hidden />{text}
      </dd>
    </div>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h3 className="section-title">{title}</h3>
      {right}
    </div>
  );
}
