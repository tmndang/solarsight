"use client";
/**
 * Candidate map (MapLibre via react-map-gl). Two GeoJSON sources (points + polygons) are rebuilt
 * only when the scenario result changes; hover/selection use feature-state (no data re-upload).
 * Scenario logic lives in lib/scenario — this component only renders its output.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Source, NavigationControl, type MapRef, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { FeatureCollection, Point } from "geojson";
import { setWorkerUrl, type Map as MaplibreMap } from "maplibre-gl";
import { useApp } from "@/store/app-store";
import { useScenarioResult } from "@/lib/data/load";
import { CARTO_DARK, DIAMOND_ICON, FALLBACK_STYLE, INTERACTIVE_LAYERS, LABEL_LAYER, NC_BOUNDS,
  SELECTED_CONTEXT_LAYERS, candidateLayers, makeDiamond } from "./map-style";
import { MapHoverCard } from "./map-hover-card";
import { MapLegend } from "./map-legend";
import { NoResultsOverlay } from "./no-results-overlay";

const STYLE_TIMEOUT_MS = 6000;
// see scripts/sync-data.mjs: worker shipped as a static module next to the app
setWorkerUrl(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/maplibre/maplibre-gl-worker.mjs`);
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Camera padding that keeps targets clear of the site panel when it overlays the map (< 1280 px). */
function overlayPadding(m: MaplibreMap) {
  const c = m.getContainer(), w = c.clientWidth, h = c.clientHeight, vw = window.innerWidth;
  return { top: 40, left: 40, right: vw < 1024 ? 40 : vw < 1280 ? Math.min(420, w / 2) : 40,
    bottom: vw < 1024 ? Math.min(h * 0.6, h - 80) : 40 };
}

function extendBounds(b: [number, number, number, number], coords: unknown): void {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    const [x, y] = coords as number[];
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  } else if (Array.isArray(coords)) for (const c of coords) extendBounds(b, c);
}

export default function SolarMap() {
  const mapRef = useRef<MapRef>(null);
  const features = useApp((s) => s.data.features);
  const byId = useApp((s) => s.data.byId);
  const showScreened = useApp((s) => s.showScreened);
  const selectedId = useApp((s) => s.selectedId);
  const hovered = useApp((s) => s.hovered);
  const flyToken = useApp((s) => s.flyToken);
  const fitToken = useApp((s) => s.fitToken);
  const gridContext = useApp((s) => s.gridContext);
  const select = useApp((s) => s.select);
  const hover = useApp((s) => s.hover);
  const basemap = useApp((s) => s.basemap);
  const setBasemap = useApp((s) => s.setBasemap);
  const res = useScenarioResult();
  const [loaded, setLoaded] = useState(false);
  const [mapObj, setMapObj] = useState<MaplibreMap | null>(null);
  // label font borrowed from the loaded basemap style so its glyphs are guaranteed to exist
  const [labelFont, setLabelFont] = useState<string[] | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // ---- data (rebuilt only on scenario change) ---------------------------------------
  const polyData = useMemo(() => {
    if (!res) return null;
    return {
      type: "FeatureCollection",
      features: features.map((f) => ({
        type: "Feature", geometry: f.geometry,
        properties: { site_id: f.properties.site_id, ui_state: res.results.get(f.properties.site_id)!.uiState },
      })),
    } as FeatureCollection;
  }, [features, res]);

  const pointData = useMemo(() => {
    if (!res) return null;
    // draw order: screened < feasible < alternative < frontier (later = on top within a layer)
    const order = { screened: 0, feasible: 1, alternative: 2, frontier: 3 } as const;
    const pts = features.map((f) => {
      const p = f.properties;
      const r = res.results.get(p.site_id)!;
      return {
        type: "Feature" as const,
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] } as Point,
        properties: { site_id: p.site_id, name: p.name, ui_state: r.uiState, o: order[r.uiState] },
      };
    }).sort((a, b) => a.properties.o - b.properties.o);
    return { type: "FeatureCollection", features: pts } as FeatureCollection;
  }, [features, res]);

  const labelData = useMemo(() => {
    if (!res) return null;
    const ids = new Set(res.frontierIds);
    if (selectedId) ids.add(selectedId);
    return {
      type: "FeatureCollection",
      features: [...ids].map((id) => {
        const p = byId.get(id)!;
        return { type: "Feature", geometry: { type: "Point", coordinates: [p.longitude, p.latitude] }, properties: { name: p.name } };
      }),
    } as FeatureCollection;
  }, [res, selectedId, byId]);

  // selected site outline (visible at every zoom) + its transmission context; tiny, rebuilt per selection
  const selCtxData = useMemo(() => {
    const fc: FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!selectedId) return fc;
    const site = features.find((f) => f.properties.site_id === selectedId);
    if (site) fc.features.push({ type: "Feature", geometry: site.geometry, properties: { role: "site" } });
    for (const f of gridContext.bySite.get(selectedId) ?? []) fc.features.push(f as FeatureCollection["features"][number]);
    return fc;
  }, [selectedId, features, gridContext]);

  // ---- basemap loading / fallback ----------------------------------------------------
  const [style, setStyle] = useState<string | typeof FALLBACK_STYLE>(CARTO_DARK);
  const fallBack = useCallback(() => {
    if (style !== FALLBACK_STYLE) { setStyle(FALLBACK_STYLE); setBasemap("fallback"); }
  }, [style, setBasemap]);
  useEffect(() => {
    if (basemap !== "loading") return;
    const t = setTimeout(fallBack, STYLE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [basemap, fallBack]);

  const registerIcons = useCallback(() => {
    const m = mapRef.current?.getMap();
    if (m && !m.hasImage(DIAMOND_ICON)) m.addImage(DIAMOND_ICON, makeDiamond(), { pixelRatio: 2 });
  }, []);

  // ---- feature-state sync for hover/selection (no data re-upload) ---------------------
  const prev = useRef<{ sel: string | null; hov: string | null }>({ sel: null, hov: null });
  const applyStates = useCallback(() => {
    const m = mapRef.current?.getMap();
    if (!m || !m.getSource("cand-pt") || !m.getSource("cand-poly")) return;
    const set = (id: string | null, key: "selected" | "hover", v: boolean) => {
      if (!id) return;
      for (const src of ["cand-pt", "cand-poly"]) m.setFeatureState({ source: src, id }, { [key]: v });
    };
    set(prev.current.sel, "selected", false);
    set(prev.current.hov, "hover", false);
    set(selectedId, "selected", true);
    set(hovered?.id ?? null, "hover", true);
    prev.current = { sel: selectedId, hov: hovered?.id ?? null };
  }, [selectedId, hovered]);
  useEffect(() => { if (loaded) applyStates(); }, [loaded, applyStates, pointData]);

  // ---- camera: move only for off-map selections (list/chart), never for map clicks ----
  useEffect(() => {
    if (!flyToken || !selectedId || !mapObj) return;
    const m = mapObj;
    const p = byId.get(selectedId);
    if (!m || !p) return;
    const ll: [number, number] = [p.longitude, p.latitude];
    // below 1280 px the site panel overlays the map (right edge; bottom below 1024) — keep the site clear of it
    const c = m.getContainer(), w = c.clientWidth, h = c.clientHeight;
    const padding = overlayPadding(m);
    const pt = m.project(ll);
    const clear = pt.x >= padding.left && pt.x <= w - padding.right && pt.y >= padding.top && pt.y <= h - padding.bottom;
    if (clear && m.getZoom() >= 7) return;
    const opts = { center: ll, zoom: Math.max(m.getZoom(), 9), padding };
    if (prefersReducedMotion()) m.jumpTo(opts); else m.flyTo({ ...opts, duration: 700 });
  }, [flyToken, mapObj]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- camera: "show on map" frames the selected site and its transmission context ----
  useEffect(() => {
    if (!fitToken || !mapObj) return;
    const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of selCtxData.features) if (f.geometry.type !== "GeometryCollection") extendBounds(b, f.geometry.coordinates);
    if (!Number.isFinite(b[0])) return;
    mapObj.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: overlayPadding(mapObj), maxZoom: 15.5,
      duration: prefersReducedMotion() ? 0 : 700 });
  }, [fitToken, mapObj]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- interaction ----------------------------------------------------------------
  const pick = (e: MapLayerMouseEvent): string | null => {
    const fs = e.features ?? [];
    if (!fs.length) return null;
    const rank = { frontier: 3, alternative: 2, feasible: 1, screened: 0 } as Record<string, number>;
    const best = [...fs].sort((a, b) => (rank[b.properties?.ui_state] ?? 0) - (rank[a.properties?.ui_state] ?? 0))[0];
    return (best.properties?.site_id as string) ?? null;
  };
  const onMove = (e: MapLayerMouseEvent) => {
    const id = pick(e);
    if (id) { setPointer({ x: e.point.x, y: e.point.y }); if (hovered?.id !== id || hovered.source !== "map") hover(id, "map"); }
    else if (hovered?.source === "map") { setPointer(null); hover(null); }
  };
  const onLeave = () => { setPointer(null); if (hovered?.source === "map") hover(null); };
  const onClick = (e: MapLayerMouseEvent) => { const id = pick(e); if (id) select(id); };

  // hover card anchor: pointer for map hover; projected site for chart/list hover
  let anchor: { x: number; y: number } | null = null;
  if (hovered) {
    if (hovered.source === "map") anchor = pointer;
    else {
      const m = mapObj;
      const p = byId.get(hovered.id);
      if (m && p) {
        const pt = m.project([p.longitude, p.latitude]);
        const c = m.getContainer();
        if (pt.x >= 0 && pt.y >= 0 && pt.x <= c.clientWidth && pt.y <= c.clientHeight) anchor = { x: pt.x, y: pt.y };
      }
    }
  }

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        initialViewState={{ bounds: NC_BOUNDS, fitBoundsOptions: { padding: 32 } }}
        minZoom={5.5}
        maxZoom={16}
        mapStyle={style}
        style={{ position: "absolute", inset: 0 }}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onMoveStart={() => { if (hovered?.source === "map") { setPointer(null); hover(null); } }}
        onClick={onClick}
        cursor={hovered?.source === "map" ? "pointer" : "grab"}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true, customAttribution:
          "Candidates: NC DEQ, US EPA, USFWS NWI, USGS 3DEP, © OpenStreetMap contributors" }}
        onLoad={(e) => {
          registerIcons(); setLoaded(true); setMapObj(e.target);
          (window as unknown as { __ssMap?: MaplibreMap }).__ssMap = e.target; // read-only handle for e2e tests
          if (style === CARTO_DARK) {
            setBasemap("ok");
            const sym = e.target.getStyle().layers.find((l) => l.type === "symbol" && Array.isArray(l.layout?.["text-font"]));
            const font = sym && sym.type === "symbol" ? sym.layout?.["text-font"] : null;
            setLabelFont(Array.isArray(font) ? (font as string[]) : null);
          }
        }}
        onStyleData={registerIcons}
        onError={(e) => {
          const msg = String(e?.error?.message ?? "");
          // style/tile failures from the remote basemap -> local fallback; never crash the app
          if (style === CARTO_DARK && (!loaded || /style|fetch|tile|Failed/i.test(msg))) fallBack();
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {polyData && (
          <Source id="cand-poly" type="geojson" data={polyData} promoteId="site_id">
            {candidateLayers(showScreened).filter((l) => l.source === "cand-poly").map((l) => <Layer key={l.id} {...l} />)}
          </Source>
        )}
        {polyData && (
          <Source id="sel-ctx" type="geojson" data={selCtxData}>
            {SELECTED_CONTEXT_LAYERS.map((l) => <Layer key={l.id} {...l} />)}
          </Source>
        )}
        {pointData && (
          <Source id="cand-pt" type="geojson" data={pointData} promoteId="site_id">
            {candidateLayers(showScreened).filter((l) => l.source === "cand-pt").map((l) => <Layer key={l.id} {...l} />)}
          </Source>
        )}
        {labelData && basemap === "ok" && labelFont && (
          <Source id="cand-label" type="geojson" data={labelData}>
            <Layer {...LABEL_LAYER} layout={{ ...LABEL_LAYER.layout, "text-font": labelFont }} />
          </Source>
        )}
      </Map>
      {anchor && hovered && <MapHoverCard id={hovered.id} x={anchor.x} y={anchor.y} />}
      <MapLegend />
      {basemap === "fallback" && (
        <p role="status" className="absolute right-14 top-2.5 rounded-md border border-border bg-surface/90 px-2 py-1 text-[11px] text-text-muted">
          Basemap unavailable — showing local county outlines
        </p>
      )}
      <NoResultsOverlay />
    </div>
  );
}
