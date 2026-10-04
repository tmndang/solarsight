"use client";
/**
 * Global UI state (source state only). Derived scenario results are computed with
 * useScenarioResult() — never stored. Hover is separate from the scenario so hovering
 * never recomputes Pareto.
 */
import { create } from "zustand";
import type { CandidateFeature, CandidateProps, GridContextFeature, Meta } from "@/lib/data/schema";
import { DEFAULT_SCENARIO, type Scenario } from "@/lib/scenario/scenario";

export type HoverSource = "map" | "chart" | "list";
/** Compare slots. Letters are identities (never ranks) and stay stable when the other slot is removed. */
export type CompareSlot = "A" | "B";
export type CompareSlots = Record<CompareSlot, string | null>;
export const COMPARE_SLOTS: CompareSlot[] = ["A", "B"];
export const slotOf = (slots: CompareSlots, id: string): CompareSlot | null =>
  slots.A === id ? "A" : slots.B === id ? "B" : null;
export const compareCount = (slots: CompareSlots) => (slots.A ? 1 : 0) + (slots.B ? 1 : 0);
export type BottomTab = "tradeoffs" | "compare";

interface DataState {
  status: "loading" | "ready" | "error";
  error?: string;
  features: CandidateFeature[];
  props: CandidateProps[];
  byId: Map<string, CandidateProps>;
  meta: Meta | null;
}

/** Display-only transmission geometry per site (data/app/grid_context.geojson); optional, loaded after the core data. */
export interface GridContextState {
  status: "loading" | "ready" | "unavailable";
  bySite: Map<string, GridContextFeature[]>;
}

interface AppState {
  data: DataState;
  gridContext: GridContextState;
  /** increments when the map should frame the selected site and its transmission context */
  fitToken: number;
  fitIds: string[] | null;
  scenario: Scenario;
  showScreened: boolean;
  selectedId: string | null;
  hovered: { id: string; source: HoverSource } | null;
  /** explicit A/B comparison membership; selecting a site never changes it */
  compare: CompareSlots;
  bottomTab: BottomTab;
  bottomOpen: boolean;
  methodologyOpen: boolean;
  basemap: "loading" | "ok" | "fallback";
  /** increments when an off-map selection should move the camera */
  flyToken: number;

  setData: (d: DataState) => void;
  setGridContext: (g: GridContextState) => void;
  /** frame the selected site + its transmission context, or the given sites */
  requestFit: (ids?: string[]) => void;
  setScenario: (patch: Partial<Scenario>) => void;
  setShowScreened: (v: boolean) => void;
  select: (id: string | null, opts?: { fly?: boolean }) => void;
  hover: (id: string | null, source?: HoverSource) => void;
  addToCompare: (id: string) => void;
  removeFromCompare: (id: string) => void;
  toggleCompare: (id: string) => void;
  /** one action: A = dominator, B = the dominated site; opens Compare */
  compareWithDominator: (siteId: string, dominatorId: string) => void;
  /** explicit one-click comparison of two sites (A, B); opens Compare */
  setCompare: (a: string, b: string) => void;
  clearCompare: () => void;
  setBottomTab: (t: BottomTab) => void;
  setBottomOpen: (o: boolean) => void;
  setMethodologyOpen: (o: boolean) => void;
  setBasemap: (b: AppState["basemap"]) => void;
}

export const MAX_COMPARE = 2;

export const useApp = create<AppState>((set) => ({
  data: { status: "loading", features: [], props: [], byId: new Map(), meta: null },
  gridContext: { status: "loading", bySite: new Map() },
  fitToken: 0,
  fitIds: null,
  scenario: DEFAULT_SCENARIO,
  showScreened: true,
  selectedId: null,
  hovered: null,
  compare: { A: null, B: null },
  bottomTab: "tradeoffs",
  bottomOpen: true,
  methodologyOpen: false,
  basemap: "loading",
  flyToken: 0,

  setData: (data) => set({ data }),
  setGridContext: (gridContext) => set({ gridContext }),
  requestFit: (ids) => set((s) => ({ fitToken: s.fitToken + 1, fitIds: ids ?? null })),
  setScenario: (patch) => set((s) => ({ scenario: { ...s.scenario, ...patch } })),
  setShowScreened: (showScreened) => set({ showScreened }),
  select: (id, opts) => set((s) => ({ selectedId: id, flyToken: opts?.fly ? s.flyToken + 1 : s.flyToken })),
  hover: (id, source = "map") => set((s) => {
    const cur = s.hovered;
    if (!id) return cur ? { hovered: null } : {};
    if (cur && cur.id === id && cur.source === source) return {}; // no-op: avoids re-render loops
    return { hovered: { id, source } };
  }),
  addToCompare: (id) => set((s) => {
    if (slotOf(s.compare, id)) return {};
    if (!s.compare.A) return { compare: { ...s.compare, A: id } };
    if (!s.compare.B) return { compare: { ...s.compare, B: id } };
    return {}; // full: the user must remove a site first (membership is explicit)
  }),
  removeFromCompare: (id) => set((s) => {
    const slot = slotOf(s.compare, id);
    return slot ? { compare: { ...s.compare, [slot]: null } } : {};
  }),
  toggleCompare: (id) => (slotOf(useApp.getState().compare, id)
    ? useApp.getState().removeFromCompare(id) : useApp.getState().addToCompare(id)),
  compareWithDominator: (siteId, dominatorId) => useApp.getState().setCompare(dominatorId, siteId),
  setCompare: (a, b) => set({ compare: { A: a, B: b }, bottomTab: "compare", bottomOpen: true }),
  clearCompare: () => set({ compare: { A: null, B: null } }),
  setBottomTab: (bottomTab) => set({ bottomTab, bottomOpen: true }),
  setBottomOpen: (bottomOpen) => set({ bottomOpen }),
  setMethodologyOpen: (methodologyOpen) => set({ methodologyOpen }),
  setBasemap: (basemap) => set({ basemap }),
}));
