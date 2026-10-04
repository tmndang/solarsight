"use client";
/** Persistent A/B Compare state over the map: always shows which sites are being compared. */
import { ArrowRight, X } from "lucide-react";
import { COMPARE_SLOTS, compareCount, useApp } from "@/store/app-store";
import { Button } from "@/components/ui/primitives";
import { CompareBadge } from "@/components/shared/compare-badge";

export function CompareTray() {
  const compare = useApp((s) => s.compare);
  const byId = useApp((s) => s.data.byId);
  const remove = useApp((s) => s.removeFromCompare);
  const select = useApp((s) => s.select);
  const setTab = useApp((s) => s.setBottomTab);
  const tab = useApp((s) => s.bottomTab);
  const open = useApp((s) => s.bottomOpen);
  const n = compareCount(compare);
  if (n === 0) return null;
  return (
    <section aria-label="Compare" className="absolute left-3 top-3 z-20 w-[248px] rounded-md border border-border bg-surface/95 px-3 py-2 shadow-[var(--shadow-raised)] backdrop-blur-sm">
      <h2 className="section-title mb-1">Compare</h2>
      <ul className="space-y-1">
        {COMPARE_SLOTS.map((slot) => {
          const id = compare[slot];
          const c = id ? byId.get(id) : undefined;
          return (
            <li key={slot} className="flex items-center gap-2 text-[13px]">
              <CompareBadge slot={slot} className={c ? "" : "opacity-40"} />
              {c ? (
                <>
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-text-primary hover:underline" onClick={() => select(c.site_id, { fly: true })}>
                    {c.name}
                  </button>
                  <button type="button" aria-label={`Remove ${c.name} from Compare`} onClick={() => remove(c.site_id)} className="rounded p-0.5 text-text-muted hover:text-text-primary">
                    <X size={13} />
                  </button>
                </>
              ) : (
                <span className="text-xs text-text-muted">Select another site to compare</span>
              )}
            </li>
          );
        })}
      </ul>
      {n === 2 && !(tab === "compare" && open) && (
        <Button variant="subtle" size="sm" className="mt-2 w-full justify-center" onClick={() => setTab("compare")}>
          Compare sites <ArrowRight size={13} aria-hidden />
        </Button>
      )}
    </section>
  );
}
