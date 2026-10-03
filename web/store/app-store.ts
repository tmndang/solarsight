"use client";
/**
 * Global UI state (source state only). Derived scenario results are computed with
 * useScenarioResult() — never stored. Hover is separate from the scenario so hovering
 * never recomputes Pareto.
 */
import { create } from "zustand";
import type { CandidateFeature, CandidateProps, Meta } from "@/lib/data/schema";
import { DEFAULT_SCENARIO, type Scenario } from "@/lib/scenario/scenario";

export type HoverSource = "map" | "chart" | "list";
export type BottomTab = "tradeoffs" | "compare";

interface DataState {
  status: "loading" | "ready" | "error";
  error?: string;
  features: CandidateFeature[];
  props: CandidateProps[];
  byId: Map<string, CandidateProps>;
  meta: Meta | null;
}

interface AppState {
  data: DataState;
  scenario: Scenario;
  showScreened: boolean;
  selectedId: string | null;
  hovered: { id: string; source: HoverSource } | null;
  compareIds: string[];
  bottomTab: BottomTab;
  bottomOpen: boolean;
  methodologyOpen: boolean;
  basemap: "loading" | "ok" | "fallback";
  /** increments when an off-map selection should move the camera */
  flyToken: number;

  setData: (d: DataState) => void;
  setScenario: (patch: Partial<Scenario>) => void;
  setShowScreened: (v: boolean) => void;
  select: (id: string | null, opts?: { fly?: boolean }) => void;
  hover: (id: string | null, source?: HoverSource) => void;
  toggleCompare: (id: string) => void;
  addCompare: (ids: string[]) => void;
  clearCompare: () => void;
  setBottomTab: (t: BottomTab) => void;
  setBottomOpen: (o: boolean) => void;
  setMethodologyOpen: (o: boolean) => void;
  setBasemap: (b: AppState["basemap"]) => void;
}

export const MAX_COMPARE = 3;

export const useApp = create<AppState>((set) => ({
  data: { status: "loading", features: [], props: [], byId: new Map(), meta: null },
  scenario: DEFAULT_SCENARIO,
  showScreened: true,
  selectedId: null,
  hovered: null,
  compareIds: [],
  bottomTab: "tradeoffs",
  bottomOpen: true,
  methodologyOpen: false,
  basemap: "loading",
  flyToken: 0,

  setData: (data) => set({ data }),
  setScenario: (patch) => set((s) => ({ scenario: { ...s.scenario, ...patch } })),
  setShowScreened: (showScreened) => set({ showScreened }),
  select: (id, opts) => set((s) => ({ selectedId: id, flyToken: opts?.fly ? s.flyToken + 1 : s.flyToken })),
  hover: (id, source = "map") => set({ hovered: id ? { id, source } : null }),
  toggleCompare: (id) => set((s) => {
    if (s.compareIds.includes(id)) return { compareIds: s.compareIds.filter((x) => x !== id) };
    if (s.compareIds.length >= MAX_COMPARE) return {};
    return { compareIds: [...s.compareIds, id] };
  }),
  addCompare: (ids) => set((s) => {
    const next = [...s.compareIds];
    for (const id of ids) if (!next.includes(id)) next.push(id);
    return { compareIds: next.slice(-MAX_COMPARE), bottomTab: "compare", bottomOpen: true };
  }),
  clearCompare: () => set({ compareIds: [] }),
  setBottomTab: (bottomTab) => set({ bottomTab, bottomOpen: true }),
  setBottomOpen: (bottomOpen) => set({ bottomOpen }),
  setMethodologyOpen: (methodologyOpen) => set({ methodologyOpen }),
  setBasemap: (basemap) => set({ basemap }),
}));
