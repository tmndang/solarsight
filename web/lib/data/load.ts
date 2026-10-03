"use client";
import { useEffect, useMemo } from "react";
import { parseData } from "./schema";
import { useApp } from "@/store/app-store";
import { computeScenario, type ScenarioResult } from "@/lib/scenario/scenario";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Load the two local data files once, validate, and put them in the store. No other network data. */
export function useLoadData() {
  const setData = useApp((s) => s.setData);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, m] = await Promise.all([
          fetch(`${BASE}/data/candidates.geojson`).then((r) => { if (!r.ok) throw new Error(`candidates.geojson: HTTP ${r.status}`); return r.json(); }),
          fetch(`${BASE}/data/meta.json`).then((r) => { if (!r.ok) throw new Error(`meta.json: HTTP ${r.status}`); return r.json(); }),
        ]);
        const { candidates, meta } = parseData(c, m);
        const props = candidates.features.map((f) => f.properties);
        if (!cancelled) setData({ status: "ready", features: candidates.features, props, byId: new Map(props.map((p) => [p.site_id, p])), meta });
      } catch (e) {
        if (!cancelled) setData({ status: "error", error: e instanceof Error ? e.message : String(e), features: [], props: [], byId: new Map(), meta: null });
      }
    })();
    return () => { cancelled = true; };
  }, [setData]);
}

// One shared cache so every component reading the scenario gets the same object (computed once).
let cache: { props: unknown; meta: unknown; scenario: unknown; result: ScenarioResult } | null = null;
function cachedCompute(props: Parameters<typeof computeScenario>[0], meta: Parameters<typeof computeScenario>[1],
  scenario: Parameters<typeof computeScenario>[2]): ScenarioResult {
  if (cache && cache.props === props && cache.meta === meta && cache.scenario === scenario) return cache.result;
  const result = computeScenario(props, meta, scenario);
  cache = { props, meta, scenario, result };
  return result;
}

/** Derived scenario state, keyed on data + scenario only (hover never triggers recomputation). */
export function useScenarioResult(): ScenarioResult | null {
  const props = useApp((s) => s.data.props);
  const meta = useApp((s) => s.data.meta);
  const scenario = useApp((s) => s.scenario);
  return useMemo(() => (meta && props.length ? cachedCompute(props, meta, scenario) : null), [props, meta, scenario]);
}
