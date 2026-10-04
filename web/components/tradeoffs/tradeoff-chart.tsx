"use client";
/**
 * Tradeoff scatter: x = distance to mapped ≥69 kV line (√ scale), y = mean slope of usable land (°).
 * Points are discrete candidates — no line connects frontier sites (no implied intermediate options).
 * x = 0 is a geometric state (a mapped line intersects the site boundary): points keep their true x of 0 and the
 * zero tick reads "Intersects"; text never says "0.00 km".
 * Hover/selection are shared with the map through the store. Shape renderers are module-level and
 * read everything from the point payload, so hovering never remounts points.
 */
import { useMemo } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import type { UiState } from "@/lib/scenario/scenario";
import { STATE_COLOR, STATE_LABEL } from "@/components/shared/status";
import { GRID_INTERSECTS, fmtDeg, fmtGridValue } from "@/lib/formatting/format";

interface Pt { id: string; name: string; x: number; y: number; state: UiState; infeasible?: boolean; sel?: boolean; hov?: boolean; label?: string; dy?: number }
interface ShapeProps { cx?: number; cy?: number; payload: Pt }

const X_TICKS = [0, 0.25, 0.5, 1, 2, 4, 8, 12, 16, 24];
const SIZE: Record<UiState, number> = { frontier: 6.5, alternative: 4.6, feasible: 3.2, screened: 3 };

function Glyph({ cx, cy, state, infeasible }: { cx: number; cy: number; state: UiState; infeasible?: boolean }) {
  const c = STATE_COLOR[state];
  if (infeasible) return <circle cx={cx} cy={cy} r={5} fill="none" stroke="var(--text-muted)" strokeDasharray="2 2" strokeWidth={1.5} />;
  if (state === "frontier") {
    const s = SIZE.frontier;
    return <path d={`M${cx},${cy - s} L${cx + s},${cy} L${cx},${cy + s} L${cx - s},${cy} Z`} fill={c} stroke="var(--surface)" strokeWidth={2} />;
  }
  return <circle cx={cx} cy={cy} r={SIZE[state]} fill={c} fillOpacity={state === "feasible" ? 0.8 : 1}
    stroke={state === "alternative" ? "var(--surface)" : "none"} strokeWidth={1} />;
}

function PointShape({ cx, cy, payload }: ShapeProps) {
  if (cx === undefined || cy === undefined) return null;
  const { hover, select } = useApp.getState();
  return (
    <g
      role="button"
      tabIndex={-1}
      aria-label={`${payload.name}: ${payload.infeasible ? "doesn't fit this project" : STATE_LABEL[payload.state]}, ${payload.x === 0 ? "mapped ≥69 kV line intersects site boundary" : `${payload.x.toFixed(2)} km`}, ${payload.y.toFixed(2)}°`}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => useApp.getState().hover(payload.id, "chart")}
      onMouseLeave={() => { if (useApp.getState().hovered?.source === "chart") hover(null); }}
      onClick={() => select(payload.id, { fly: true })}
    >
      <circle cx={cx} cy={cy} r={9} fill="transparent" />
      <Glyph cx={cx} cy={cy} state={payload.state} infeasible={payload.infeasible} />
    </g>
  );
}
const renderPoint = (p: unknown) => <PointShape {...(p as ShapeProps)} />;

/** selection/hover ring (+ compact hover label), drawn above the state glyph, never replacing it */
const renderRing = (p: unknown) => {
  const { cx, cy, payload } = p as ShapeProps;
  if (cx === undefined || cy === undefined) return <g />;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={payload.sel ? 10 : 9} fill="none" stroke={payload.sel ? "var(--selected)" : "var(--text-primary)"} strokeWidth={payload.sel ? 2 : 1.5} />
      {payload.hov && !payload.sel && payload.label && (
        <text x={cx + 13} y={cy - 9} fontSize={11} fill="var(--text-primary)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">{payload.label}</text>
      )}
    </g>
  );
};

const renderLabel = (p: unknown) => {
  const { cx, cy, payload } = p as ShapeProps;
  if (cx === undefined || cy === undefined) return <g />;
  return (
    <text x={cx + 12} y={cy + 4 + (payload.dy ?? 0)} fontSize={11} fill="var(--text-primary)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke" pointerEvents="none">
      {payload.name}{payload.infeasible ? " (doesn't fit)" : ""}
    </text>
  );
};

export function TradeoffChart() {
  const res = useScenarioResult();
  const byId = useApp((s) => s.data.byId);
  const selectedId = useApp((s) => s.selectedId);
  const hoverId = useApp((s) => s.hovered?.id ?? null);

  const base = useMemo(() => {
    if (!res) return { points: [] as Pt[], xMax: 1, yMax: 1 };
    const order = { feasible: 0, alternative: 1, frontier: 2, screened: -1 } as const;
    const pts: Pt[] = res.eligibleIds.map((id) => {
      const c = byId.get(id)!;
      return { id, name: c.name, x: c.grid_line_distance_km!, y: c[res.terrainKey]!, state: res.results.get(id)!.uiState };
    }).sort((a, b) => order[a.state] - order[b.state]);
    return { points: pts, xMax: Math.max(1, ...pts.map((p) => p.x)), yMax: Math.max(1, ...pts.map((p) => p.y)) };
  }, [res, byId]);

  // selected site is plotted even when it no longer fits (dashed, "doesn't fit")
  const extra: Pt | null = useMemo(() => {
    if (!res || !selectedId || res.results.get(selectedId)?.screenEligible) return null;
    const c = byId.get(selectedId);
    const y = c?.[res.terrainKey];
    if (!c || c.grid_line_distance_km === null || y === null || y === undefined) return null;
    return { id: c.site_id, name: c.name, x: c.grid_line_distance_km, y, state: "screened", infeasible: true };
  }, [res, selectedId, byId]);

  const all = useMemo(() => (extra ? [...base.points, extra] : base.points), [base, extra]);
  // direct labels (frontier + selected) with greedy vertical de-collision in normalised data space
  const labels = useMemo(() => {
    const xs = Math.sqrt(Math.max(base.xMax, extra?.x ?? 0)), ys = Math.max(base.yMax, extra?.y ?? 0);
    const ls = all.filter((p) => p.state === "frontier" || p.id === selectedId)
      .map((p) => ({ ...p, nx: Math.sqrt(p.x) / xs, ny: p.y / ys }))
      .sort((a, b) => a.ny - b.ny); // bottom-most first; stack later labels upward (free space)
    const placed: { nx: number; ny: number; dy: number }[] = [];
    return ls.map((p) => {
      let dy = 0;
      for (const q of placed) if (Math.abs(q.nx - p.nx) < 0.25 && Math.abs(q.ny - p.ny) < 0.12) dy = Math.min(dy, q.dy - 13);
      placed.push({ nx: p.nx, ny: p.ny, dy });
      return { ...p, dy };
    });
  }, [all, selectedId, base, extra]);
  const rings = useMemo(() => all.filter((p) => p.id === selectedId || p.id === hoverId).map((p) => ({
    ...p, sel: p.id === selectedId, hov: p.id === hoverId,
    label: `${p.name} · ${p.x === 0 ? GRID_INTERSECTS : fmtGridValue(p.x)} · ${fmtDeg(p.y)}`,
  })), [all, selectedId, hoverId]);

  if (!res) return null;
  if (base.points.length === 0) {
    return <div className="flex h-full items-center justify-center text-[13px] text-text-muted">No feasible sites to compare under the current requirements.</div>;
  }
  const xNeed = Math.max(base.xMax, extra?.x ?? 0) * 0.995; // 12.004 km should not force a 16 km axis
  const xDomainMax = Math.max(X_TICKS.find((t) => t >= xNeed) ?? Math.ceil(xNeed), Math.max(base.xMax, extra?.x ?? 0));
  const yDomainMax = Math.ceil(Math.max(base.yMax, extra?.y ?? 0) * 2) / 2 + 0.5;
  const ticks = X_TICKS.filter((t) => t <= xDomainMax);

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 14, right: 28, bottom: 30, left: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" />
          <XAxis type="number" dataKey="x" scale="sqrt" domain={[0, xDomainMax]} ticks={ticks}
            tickFormatter={(v: number) => (v === 0 ? "Intersects" : v < 1 ? v.toFixed(2) : String(v))}
            stroke="var(--border-strong)" tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            label={{ value: "Site boundary to mapped ≥69 kV line (km, √ scale)", position: "insideBottom", offset: -18, fill: "var(--text-secondary)", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, yDomainMax]} stroke="var(--border-strong)" width={48}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={(v: number) => `${v}°`}
            label={{ value: "Mean slope of usable land (°)", angle: -90, position: "insideLeft", offset: 12, dy: 80, fill: "var(--text-secondary)", fontSize: 11 }} />
          <Scatter data={all} isAnimationActive={false} shape={renderPoint} />
          <Scatter data={rings} isAnimationActive={false} shape={renderRing} />
          <Scatter data={labels} isAnimationActive={false} shape={renderLabel} />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="pointer-events-none absolute right-8 top-1 text-[10px] text-text-muted">← closer to transmission · ↓ flatter usable land</p>
      <div className="sr-only"><table>
        <caption>Feasible sites plotted by site-boundary distance to mapped ≥69 kV transmission (0 = line intersects the boundary) and mean slope of usable land</caption>
        <thead><tr><th>Site</th><th>Tradeoff state</th><th>Distance (km)</th><th>Usable-land slope (°)</th></tr></thead>
        <tbody>{base.points.map((p) => <tr key={p.id}><td>{p.name}</td><td>{STATE_LABEL[p.state]}</td><td>{p.x === 0 ? "0 (line intersects site boundary)" : p.x.toFixed(2)}</td><td>{p.y.toFixed(2)}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
