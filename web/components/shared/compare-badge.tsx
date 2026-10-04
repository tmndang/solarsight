import type { CompareSlot } from "@/store/app-store";
import { cn } from "@/lib/utils";

/**
 * Ⓐ / Ⓑ identity badge for compared sites. Same look on map (canvas icon), chart (SVG) and panels.
 * Letters are identities, not ranks; frontier/alternative styling is kept separately by the state glyph.
 */
export function CompareBadge({ slot, size = 18, className }: { slot: CompareSlot; size?: number; className?: string }) {
  return (
    <span
      aria-label={`Compare site ${slot}`}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-selected font-semibold leading-none text-surface", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
    >
      {slot}
    </span>
  );
}
