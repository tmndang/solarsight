import type { StyleSpecification, FillLayerSpecification, LineLayerSpecification,
  CircleLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";

type SourcedLayer = FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification | SymbolLayerSpecification;

/** Primary basemap: CARTO Dark Matter (keyless; © OpenStreetMap contributors © CARTO). */
export const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const NC_BOUNDS: [[number, number], [number, number]] = [[-84.32, 33.84], [-75.46, 36.59]];

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Local fallback when the remote basemap cannot load: dark background + NC county lines. No glyphs. */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: { context: { type: "geojson", data: `${BASE}/data/context.geojson` } },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0d141b" } },
    { id: "counties-fill", type: "fill", source: "context", paint: { "fill-color": "#111b24" } },
    { id: "counties-line", type: "line", source: "context", paint: { "line-color": "#24323e", "line-width": 0.6 } },
  ],
};

const STATE_COLOR = {
  frontier: "#c4862a",
  alternative: "#2e9bba",
  feasible: "#8a99a8",
  screened: "#3d4955",
} as const;

const byState = ["match", ["get", "ui_state"],
  "frontier", STATE_COLOR.frontier, "alternative", STATE_COLOR.alternative, "feasible", STATE_COLOR.feasible,
  STATE_COLOR.screened] as unknown as string;

const radiusByState = (f: number, a: number, fe: number, s: number) =>
  ["match", ["get", "ui_state"], "frontier", f, "alternative", a, "feasible", fe, s] as unknown as number;

const sel = ["boolean", ["feature-state", "selected"], false];
const hov = ["boolean", ["feature-state", "hover"], false];

/** Points fade a little once polygons are readable (zoom 12+). */
const ptOpacity = (base: number) => ["interpolate", ["linear"], ["zoom"], 12, base, 13.5, base * 0.45] as unknown as number;

export function candidateLayers(showScreened: boolean): SourcedLayer[] {
  const vis = showScreened ? "visible" : "none";
  return [
    {
      id: "poly-fill", type: "fill", source: "cand-poly", minzoom: 9.5,
      filter: showScreened ? ["has", "ui_state"] : ["!=", ["get", "ui_state"], "screened"],
      paint: {
        "fill-color": byState,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 9.5, 0,
          11.5, ["match", ["get", "ui_state"], "screened", 0.12, 0.32]] as unknown as number,
      },
    },
    {
      id: "poly-line", type: "line", source: "cand-poly", minzoom: 9.5,
      filter: showScreened ? ["has", "ui_state"] : ["any", ["!=", ["get", "ui_state"], "screened"], sel] as never,
      paint: {
        "line-color": ["case", sel, "#f2f5f7", hov, "#e6edf3", byState] as unknown as string,
        "line-width": ["case", sel, 2.2, hov, 1.6, 1] as unknown as number,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 9.5, 0, 11, 0.9] as unknown as number,
      },
    },
    {
      id: "pt-screened", type: "circle", source: "cand-pt", layout: { visibility: vis },
      filter: ["==", ["get", "ui_state"], "screened"],
      paint: { "circle-radius": 2.5, "circle-color": STATE_COLOR.screened, "circle-opacity": ptOpacity(0.75),
        "circle-color-transition": { duration: 250 }, "circle-radius-transition": { duration: 250 } },
    },
    {
      id: "pt-feasible", type: "circle", source: "cand-pt", filter: ["==", ["get", "ui_state"], "feasible"],
      paint: { "circle-radius": 4, "circle-color": STATE_COLOR.feasible, "circle-opacity": ptOpacity(0.9),
        "circle-radius-transition": { duration: 250 } },
    },
    {
      id: "pt-alternative", type: "circle", source: "cand-pt", filter: ["==", ["get", "ui_state"], "alternative"],
      paint: { "circle-radius": 6, "circle-color": STATE_COLOR.alternative, "circle-stroke-width": 1,
        "circle-stroke-color": "#0e151c", "circle-opacity": ptOpacity(1), "circle-radius-transition": { duration: 250 } },
    },
    // frontier = diamond icon (shape + colour, matching legend/chart glyph ◆)
    {
      id: "pt-frontier", type: "symbol", source: "cand-pt", filter: ["==", ["get", "ui_state"], "frontier"],
      layout: { "icon-image": DIAMOND_ICON, "icon-allow-overlap": true, "icon-ignore-placement": true },
      paint: { "icon-opacity": ptOpacity(1) },
    },
    // selection / hover rings on top of the state fill (never replace it)
    {
      id: "pt-halo", type: "circle", source: "cand-pt",
      paint: {
        "circle-radius": ["+", radiusByState(8, 6, 4, 2.5), ["case", sel, 5, 4]] as unknown as number,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": ["case", sel, "#f2f5f7", "#e6edf3"] as unknown as string,
        "circle-stroke-width": ["case", sel, 2.2, hov, 1.5, 0] as unknown as number,
        "circle-stroke-opacity": ["case", sel, 1, hov, 0.9, 0] as unknown as number,
      },
    },
  ];
}

/**
 * Selected-site transmission context (source "sel-ctx": the selected polygon + its grid_context features).
 * Mapped ≥69 kV lines use a violet that no candidate state uses; the dashed connector is the measured
 * shortest boundary-to-line distance (absent when a line intersects the boundary). Drawn under the points.
 */
export const GRID_LINE_COLOR = "#c084fc";
const role = (r: string) => ["==", ["get", "role"], r] as never;
export const SELECTED_CONTEXT_LAYERS: LineLayerSpecification[] = [
  { id: "sel-site", type: "line", source: "sel-ctx", filter: role("site"),
    paint: { "line-color": "#f2f5f7", "line-width": 2, "line-opacity": 0.95 } },
  { id: "sel-grid-casing", type: "line", source: "sel-ctx", filter: role("line"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#0a1016", "line-width": ["case", ["get", "nearest"], 6, 4.5] as never, "line-opacity": 0.85 } },
  { id: "sel-grid-line", type: "line", source: "sel-ctx", filter: role("line"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": GRID_LINE_COLOR, "line-width": ["case", ["get", "nearest"], 2.8, 1.8] as never } },
  { id: "sel-connector", type: "line", source: "sel-ctx", filter: role("connector"),
    paint: { "line-color": "#f2f5f7", "line-width": 1.6, "line-dasharray": [2, 1.5] } },
];

export const LABEL_LAYER: SymbolLayerSpecification = {
  id: "label", type: "symbol", source: "cand-label",
  layout: {
    "text-field": ["get", "name"],
    "text-size": 12,
    "text-offset": [0.9, 0],
    "text-anchor": "left",
    "text-max-width": 14,
    "text-optional": true,
  },
  paint: { "text-color": "#e6edf3", "text-halo-color": "#0a1016", "text-halo-width": 1.6 },
};

export const DIAMOND_ICON = "ss-frontier-diamond";

/** 2x pixel-ratio diamond: amber fill with a surface-colour ring (registered on every style load). */
export function makeDiamond(): { width: number; height: number; data: Uint8Array } {
  const s = 40; // 20 css px at pixelRatio 2
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.moveTo(s / 2, 2); g.lineTo(s - 2, s / 2); g.lineTo(s / 2, s - 2); g.lineTo(2, s / 2); g.closePath();
  g.fillStyle = "#0e151c"; g.fill();
  g.beginPath();
  g.moveTo(s / 2, 7); g.lineTo(s - 7, s / 2); g.lineTo(s / 2, s - 7); g.lineTo(7, s / 2); g.closePath();
  g.fillStyle = STATE_COLOR.frontier; g.fill();
  const d = g.getImageData(0, 0, s, s);
  return { width: s, height: s, data: new Uint8Array(d.data.buffer) };
}

/** Ⓐ/Ⓑ compare badges: canvas icons (no glyph server needed, so they also work on the offline fallback basemap). */
export const compareIcon = (slot: "A" | "B") => `ss-compare-${slot}`;
export function makeCompareBadge(slot: "A" | "B"): { width: number; height: number; data: Uint8Array } {
  const s = 36; // 18 css px at pixelRatio 2
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2); g.fillStyle = "#0e151c"; g.fill();
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2); g.fillStyle = "#f2f5f7"; g.fill();
  g.fillStyle = "#0e151c"; g.font = "700 20px system-ui, -apple-system, Segoe UI, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(slot, s / 2, s / 2 + 1);
  const d = g.getImageData(0, 0, s, s);
  return { width: s, height: s, data: new Uint8Array(d.data.buffer) };
}
export const COMPARE_LAYER: SymbolLayerSpecification = {
  id: "cmp-badge", type: "symbol", source: "cmp-pt",
  layout: { "icon-image": ["concat", "ss-compare-", ["get", "slot"]] as never, "icon-allow-overlap": true,
    "icon-ignore-placement": true, "icon-anchor": "bottom-left", "icon-offset": [5, -5] },
};

export const INTERACTIVE_LAYERS =["pt-frontier", "pt-alternative", "pt-feasible", "pt-screened", "poly-fill"];
