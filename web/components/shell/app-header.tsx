"use client";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M9 1.5 16.5 9 9 16.5 1.5 9Z" fill="var(--pareto-frontier)" />
      <path d="M9 5.5 12.5 9 9 12.5 5.5 9Z" fill="var(--surface)" />
    </svg>
  );
}

export function AppHeader({ summary, onMethodology, extra }: { summary?: React.ReactNode; onMethodology?: () => void; extra?: React.ReactNode }) {
  return (
    <header className="flex min-w-0 items-center gap-4 border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-[0.01em] text-text-primary">SolarSight</span>
        <span className="hidden text-xs text-text-muted md:inline">NC brownfield solar screening</span>
      </div>
      <div className="min-w-0 flex-1">{summary}</div>
      {extra}
      <Button variant="ghost" onClick={onMethodology} aria-label="Open methodology and data sources">
        <BookOpen size={15} aria-hidden /> <span className="max-[640px]:sr-only">Methodology</span>
      </Button>
    </header>
  );
}
