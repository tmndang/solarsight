# SolarSight — UI/UX and frontend architecture specification (frozen for implementation)

Inputs inspected: `data/app/candidates.geojson` (662 features, 2.16 MB, 15.8k vertices, 557
Polygon + 105 MultiPolygon, median footprint ~350 m across), `data/app/meta.json` (assumptions,
basis, 70-field dictionary, statuses, scenarios, warnings), `src/analysis/{scenario,pareto,status,
schema}.py`, the foundation docs. There is no existing frontend; Node 22 and npm 10 are available.

**Bug fixed during this phase.** `export_app_data.py` wrote every float column containing a NaN
as JSON *strings*. This affected the Pareto terrain objective `usable_mean_slope_deg_slope*`, and a
browser would have sorted `"0.77" < "1.2"` as text. Now every numeric field exports as a number or
`null`. Two guards were added: a regression test, and `data/app/fixtures/scenario_expected.json`
(72 golden scenario cases from the Python engine) for testing the TypeScript port.

---

## 1. Product design thesis

SolarSight should feel like **planning software with a live decision engine**: a dark, quiet,
map-first workspace where the user states a project, watches the search space collapse, and then
interrogates the few remaining sites.

Every visual element answers one of five questions:
* what am I building;
* what is left;
* where is it;
* what am I trading;
* why not that one.

Statistics serve the map; they never become the page. Source honesty is a visible design feature:
EPA history, SolarSight analysis and DEQ records look different on purpose.

## 2. Recommended frontend stack (decided)

| Category | Decision | Version | Why |
|---|---|---|---|
| Framework | **Next.js (App Router) + React + TypeScript**, static export (`output: "export"`) | next 16.3, react 19.3 | Fast scaffold; static files serve offline; no server needed |
| Styling | **Tailwind CSS v4** (CSS-first `@theme` tokens) | 4.3 | Tokens live in one CSS file; utilities reference tokens only |
| Component system | **shadcn/ui** (copied source, Radix-based), restyled with SolarSight tokens | shadcn 4.21 CLI | Accessible primitives we own and restyle; not a dashboard look |
| Icons | **lucide-react** | 1.51 | Ships with shadcn; consistent line icons |
| Mapping | **maplibre-gl + react-map-gl/maplibre** (declarative `Source`/`Layer`) | 6.12 / 8.1 | GPU layers, feature-state hover/selection, no API key |
| Basemap | **CARTO Dark Matter GL style** (keyless; "© OpenStreetMap contributors © CARTO") + **local fallback style** | — | Built for data overlays; fallback keeps the app working offline |
| Charts | **Recharts 3** `ScatterChart` with custom shapes | 3.10 | One 2D scatter with custom glyphs and events; fine for ≤ 200 points |
| State | **Zustand** | 5.0 | MapLibre event handlers, chart, panels and header share selection/hover; selector subscriptions stop hover from re-rendering the map tree; no stale closures in map callbacks |
| Animation | **CSS transitions + MapLibre paint transitions** (no Motion) | — | Only state changes are animated |
| Tooltip / popover | shadcn **Tooltip** (Radix) for info icons; **custom absolutely-positioned hover card** on the map and chart | — | Map hover is anchored to map pixels, not DOM triggers |
| Drawer / sheet | shadcn **Sheet** (Radix Dialog) for Methodology and the mobile bottom sheet | — | No `vaul` |
| Data validation | **Zod 4** schema applied once at load | 4.6 | Catches type drift (as with the string bug) and fails loudly |
| Tests | **Vitest** (dev) | — | Golden-fixture tests for the TS scenario/Pareto port |

### Dependencies

* **Exists**: nothing (no frontend yet).
* **Add (runtime)**: `next react react-dom maplibre-gl react-map-gl recharts zustand zod lucide-react`,
  plus what `shadcn add` installs (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`).
* **Add (dev)**: `typescript @types/react @types/node tailwindcss @tailwindcss/postcss vitest`.
* **Do not add**: Redux, Motion/Framer, deck.gl, Turf (representative points are already in the
  data), d3 (Recharts covers the scales), vaul, React Query/SWR, any UI kit besides shadcn, Mapbox,
  date libraries, a charting framework beyond Recharts, auth/database/API libraries.

Location: `web/` at repo root. A `web/scripts/sync-data.mjs` (run on `predev`/`prebuild`) copies
`data/app/candidates.geojson`, `meta.json` and (M3) `context.geojson` into `web/public/data/`.
Fixtures stay in `data/app/fixtures/` and are read by Vitest only.

## 3. Visual direction

**Dark slate planning tool.** I chose dark over light:
* the two salient states (amber, cyan) have far more headroom against a dark map;
* the scatter and map share one surface;
* CARTO Dark Matter keeps roads and town labels legible at low visual weight.

Light basemaps (Positron) make amber read as brown and cyan as pale. For projector risk, the
surface is slate (`#0E151C`), not black, and all text meets WCAG AA.

### Design tokens (`web/app/globals.css`, `@theme`)

| Token | Value | Use |
|---|---|---|
| `--background` | `#0A1016` | app canvas behind panels |
| `--surface` | `#0E151C` | panels, chart surface (validated against this) |
| `--surface-raised` | `#151F28` | hover card, popovers, active rows |
| `--surface-sunken` | `#0B1218` | metric group wells |
| `--border` | `#22303C` | panel dividers, inputs |
| `--border-strong` | `#33434F` | focused / active outlines |
| `--text-primary` | `#E6EDF3` | values, titles (15.6:1 on surface) |
| `--text-secondary` | `#A9B6C2` | labels (8.6:1) |
| `--text-muted` | `#71808E` | metadata, units (4.6:1) |
| `--accent` | `#3AA0D0` | interactive accent: focus ring, active toggle |
| `--pareto-frontier` | `#C4862A` | frontier marks (validated) |
| `--pareto-alternative` | `#2E9BBA` | strong-alternative marks (validated) |
| `--candidate-feasible` | `#8A99A8` | other feasible marks |
| `--candidate-screened` | `#3D4955` | screened-out marks (2.0:1, intentionally recessive; legend + label relief) |
| `--selected` | `#F2F5F7` | selection ring (any state) |
| `--warning` | `#D9A441` + icon | data caveats ("not assessed") |
| `--danger` | `#E5735F` + icon | "not feasible for this project" |
| `--source-epa` | `#8C7BD1` | EPA historical badge dot |
| `--source-derived` | `#3AA0D0` | SolarSight-derived badge dot |
| `--source-deq` | `#6FB58A` | DEQ badge dot |
| `--chart-grid` | `#1C2731` | gridlines |
| `--radius-sm/md/lg` | `4px / 6px / 10px` | badges / controls / panels |
| `--shadow-raised` | `0 8px 24px rgb(0 0 0 / .45)` | hover card, sheets only |
| spacing | 4-px grid; panel padding 16, group gap 12, row gap 6 | |

Text never wears the status color. Status is carried by a colored glyph next to text in text
tokens (dataviz rule).

### Typography (Geist Sans + Geist Mono via `next/font`)

| Role | Spec |
|---|---|
| Product title | Geist Sans 15/20 semibold, letter-spacing 0.01em |
| Section title | Geist Sans 11/16 semibold uppercase, tracking 0.08em, `--text-muted` |
| Site name | Geist Sans 18/24 semibold |
| Metric value | Geist Mono 15/20 medium, tabular-nums, `--text-primary` |
| Metric value (hero, project fit) | Geist Mono 20/26 medium |
| Metric label | Geist Sans 12/16 regular, `--text-secondary` |
| Body | Geist Sans 13/20 |
| Metadata / units / source | Geist Sans 11/14, `--text-muted` |
| Badge | Geist Sans 11/14 medium |

## 4. Information architecture (decided)

There are two candidate layouts:
* a full-screen map with floating overlays;
* fixed columns.

**Decision: a map-first docked workspace.** The map is the largest, uninterrupted region; panels are
docked rather than floating, so the map is never hidden behind cards and MapLibre resizes
predictably. The tradeoff chart lives in a **bottom panel of the center column (Option A)**.

* NC is a wide, short state, so a bottom panel costs little geography.
* The linked map↔chart hover requires both to be visible at once, which rules out a right-panel tab
  (Option B).
* A draggable split (Option C) is not worth its complexity.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ SolarSight   [10 MW AC · ≤10% grade · NWI excluded · Brownfields]   Methodology  ⓘ    │ 56px
├──────────────────┬────────────────────────────────────────────────┬────────────────────┤
│ SCREENING  340px │                    MAP (flex)                  │ SITE  400px        │
│ Project size     │                                                │ (always present;   │
│ Terrain          │                                                │  empty state lists │
│ Mapped wetlands  │                                                │  frontier sites)   │
│ Candidate set    │                                                │                    │
│ ▸ More filters   │                         legend ▢ (bottom-left) │                    │
│ ─────────────    ├────────────────────────────────────────────────┤                    │
│ FUNNEL           │ [Tradeoffs] [Compare (2)]          ▾  280px     │                    │
│ 434→361→75→2(+6) │  scatter: grid km × usable slope               │                    │
└──────────────────┴────────────────────────────────────────────────┴────────────────────┘
```

Visual hierarchy: map → screening controls → selected site → tradeoffs → funnel → methodology.

## 5. Primary user flow

1. The app loads with defaults: **10 MW AC**, ≤10% grade, NWI excluded, Brownfields, no selection.
   The map fits NC; frontier sites are labelled.
2. The user changes project size, terrain or NWI. Map marks, funnel, scatter and selected-site fit
   all update in the same frame.
3. The user hovers a site on the map or chart. The twin mark is highlighted and a hover card shows.
4. The user clicks a site. It becomes the global selection; the right panel shows its project fit,
   its tradeoff status and, if dominated, why.
5. "Compare with *dominator*" (or "+ Compare") adds sites to the Compare tab, up to 3.
6. Methodology opens a Sheet; provenance badges explain any value inline.

## 6. Desktop wireframe — initial state (1440×900)

```
┌ ◆ SolarSight  │ 10 MW AC · ≤10% grade · NWI excluded · Brownfields │  ⓘ Methodology ┐
├───────────────┬───────────────────────────────────────────────┬───────────────────┤
│ YOUR PROJECT  │                                               │ SITE              │
│ Size (MW AC)  │      · ·   ·  ◆WestPoint Home (former)         │                   │
│ [5][10][20][40]│   ·  ●  ·   ·      ·                           │  Select a site on │
│ needs ≥35.7 ac│ ·   ·    ·  ●   ◆Singer Site      ·            │  the map or chart │
│ usable land   │      ·      ·      ●     ·                     │                   │
│               │                                               │  FRONTIER (2)     │
│ SCREENING     │                                               │  ◆ Singer Site    │
│ Exclude terrain steeper than ⓘ                                │    0.03 km · 0.4° │
│ [5%][10%][15%] grade                                          │  ◆ WestPoint Home │
│ Mapped wetlands ⓘ                                             │  line intersects… │
│ (●) Exclude NWI-mapped areas from usable land                 │                   │
│ Candidate set │                                               │  STRONG ALTERNA-  │
│ (Brownfields ▾)                               ┌legend────────┐│  TIVES (6)        │
│ ▸ More filters│                               │◆ Frontier     ││  ● Schlage Lock … │
│ ───────────── │                               │● Strong alt.  ││  …                │
│ CANDIDATES    │                               │• Other fits   ││                   │
│ 434 Brownfield│                               │· Screened out ││                   │
│     projects  │                               └───────────────┘│                   │
│ 361 Not built ├───────────────────────────────────────────────┤                   │
│     over      │ Tradeoffs  Compare            frontier: 2  ▾  │                   │
│  75 Fit 10 MW │ slope °│      ◆                                │                   │
│   2 Frontier  │  of    │  ◆  ●   ●    •      •                 │                   │
│  +6 Strong alt│ usable │ ●  • •  •      •                     │                   │
│               │        └────────────────────────── km (√)     │                   │
└───────────────┴───────────────────────────────────────────────┴───────────────────┘
```

* **Funnel** (left rail, bottom) is a vertical list of count + label rows with a thin proportional
  bar. Each count crossfades (opacity 120 ms) when it changes. The labels are the frozen terms:
  1. **Brownfield projects** (DEQ, ≥10 ac);
  2. **Not built over** (baseline screen: excludes ≥25% building coverage and existing solar);
  3. **Fit a 10 MW AC project**;
  4. **Pareto frontier**, with an indented "+N strong alternatives".

  The UI never says "status eligible". Landfill and quarry sets show their own universe label and
  an "Exploratory" chip.
* **Project size** sits under its own heading because it is the primary input. The helper line
  "needs ≥ 35.7 usable acres" is computed from `meta.derived_constants`.

## 7. Selected-site wireframe (frontier site)

```
┌ SITE ─────────────────────────────── ✕ ┐
│ Singer Site                             │
│ Chocowinity · Beaufort Co. · Brownfield │
│ ◆ Pareto frontier ⓘ   [+ Compare]       │
├─────────────────────────────────────────┤
│ YOUR 10 MW AC PROJECT                   │
│  Usable land needed        35.7 ac      │
│  Usable land available     36.2 ac      │
│  ✓ Fits   (max ≈ 10.1 MW AC)            │
│  Est. generation  ≈ 17,900 MWh/yr  ⓘ    │
├─────────────────────────────────────────┤
│ TRADEOFF POSITION                       │
│  On the frontier: no feasible site is   │
│  both closer to transmission and flatter│
│  0.03 km to mapped ≥69 kV line          │
│  0.4°  mean slope of usable land        │
├─────────────────────────────────────────┤
│ SOLARSIGHT ANALYSIS        ● SolarSight │
│  Gross area 39.2 ac  · Usable 36.2 ac   │
│  P90 slope 0.8° · Steeper than 10%: 0%  │
│  NWI-mapped overlap 0.0% ⓘ              │
│  Building coverage 7%                   │
│  Flood exposure — not assessed ⚠        │
├─────────────────────────────────────────┤
│ ▸ EPA RE-POWERING SCREEN   ● EPA (hist.)│
│ ▸ NC DEQ BROWNFIELDS RECORD   ● NC DEQ  │
│ ▸ Screening notes (4)                   │
└─────────────────────────────────────────┘
```

* The header status line pairs glyph + text, never color alone. Frontier is ◆ + "Pareto frontier";
  strong alternative is ● + "Strong alternative"; other is • + "Feasible — dominated"; screened is
  ○ + "Screened out: <reason>".
* EPA and DEQ sections are **collapsed by default** (progressive disclosure); state persists across
  selections.
* EPA expanded (history styling: values in `--text-secondary`, a "historical screen" caption, native
  units):

```
│ ▾ EPA RE-POWERING SCREEN  ● EPA historical │
│  Estimated PV (EPA, acres ÷ 6.9)  6.2 MW*  │
│  Max annual GHI          4.56 kWh/m²/day   │
│  Transmission line       0.02 mi · kV —    │
│  Substation              2.86 mi · kV —    │
│  Screening acreage       43.0 ac           │
│  Match: exact project ID (high)            │
│  *AC/DC not stated by EPA. Vintage: as     │
│   downloaded; EPA documentation dated 2022 │
```
  With no match, the section shows: "No historical EPA RE-Powering match for this project". It
  never shows zeros.
* DEQ record: project ID `BF_Number`, DEQ status (verbatim) + date, allowed use, restricted media
  (shown only when present), a "DEQ documents ↗" link, and the caption "Program status shown as
  recorded by NC DEQ; not interpreted by SolarSight."

### Dominated site (dominance explanation block replaces "Tradeoff position")

```
│ WHY THIS SITE ISN'T ON THE FRONTIER        │
│  Dominated by  ◆ Singer Site               │
│  Compared with this site, Singer Site is:  │
│   ▸ 0.03 km closer to mapped transmission  │
│     (0.03 vs 0.06 km)                      │
│   ▸ 0.34° flatter usable land (0.42 vs 0.76°)│
│  Both fit your 10 MW AC project.           │
│  [Compare these sites →]                   │
```

The text is generated from objective deltas only:
* `diff == 0` → "the same distance to mapped transmission (both 0.50 km)"; when both are 0 →
  "a mapped ≥69 kV line intersecting its boundary, as does this site" (amendment A1);
* a raw difference that rounds to zero → "slightly closer (< 0.01 km)".

The dominator is computed exactly as in Python: prefer a frontier member, then the most
strictly-better objectives, then the first in data order (verified against the fixture).

### Selected site no longer feasible (e.g. Singer Site after switching to 20 MW)

```
│ ✕ Doesn't fit your 20 MW AC project        │
│  Needs 71.4 ac usable · has 36.2 ac        │
│  Largest size it fits: ≈ 10.1 MW AC        │
│  (Still selected so you can compare; not   │
│   part of the 20 MW tradeoff analysis.)    │
```

The selection is never auto-cleared. The map mark shows the screened style plus the white
selection ring; the scatter shows a dashed hollow marker labelled "not feasible".

## 8. Tradeoff view (bottom panel, Tradeoffs tab)

```
┌ Tradeoffs  Compare(2) ─ 75 sites fit 10 MW AC · frontier 2 · strong alternatives 6 ─ ▾ ┐
│ Mean slope of usable land (°)                                     ◆ Frontier          │
│ 3.5 ┤            •           •                                   ● Strong alternative │
│ 3.0 ┤   •    •      •   •                 •                       • Other feasible     │
│ 2.0 ┤ •  •  ●  •   •      •       •                                                   │
│ 1.0 ┤ ●◆─┐ ●   •                                                                      │
│ 0.4 ┤    ◆ (Singer Site)                                                              │
│     └┬────┬────┬──────┬────────┬───────────┬──                                         │
│      0  0.25  0.5     1        2           4   Distance to mapped ≥69 kV line (km, √ scale) │
│      ← closer to transmission · ↓ flatter usable land                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

* X: `grid_line_distance_km` on a **square-root scale** (axis label says "√ scale"). Ticks:
  0, 0.25, 0.5, 1, 2, 4, 8, 12. This is needed because the median is 0.18 km and the max 12 km.
* Y: `usable_mean_slope_deg_slope{T}`, linear, from 0 to the next 0.5° above the maximum.
* Plotted: screen-eligible sites only, plus the selected site if ineligible (dashed).
* Marks: frontier ◆ 11 px `--pareto-frontier` with a 2 px `--surface` ring; strong alternative
  ● 8 px `--pareto-alternative`; other feasible • 6 px `--candidate-feasible` at 0.8 opacity.
  Selected: an added 2 px `--selected` ring plus a direct label. Hover: a 1.5 px `--text-primary`
  ring plus a tooltip.
* A stepped line connects frontier points in x order (`--pareto-frontier` at 50% opacity, 1.5 px).
* Direct labels: frontier sites only (≤ 3) plus the selected site.
* There is no "best" annotation. A neutral axis-direction hint line sits under the axis.
* Collapse ▾ shrinks the panel to its 36 px header (counts remain). It is open by default.

## 9. Comparison (bottom panel, Compare tab)

```
┌ Tradeoffs  Compare(2) ───────────────────────────────────────────────── Clear ─┐
│                         ◆ Singer Site        ● Carolina Creosoting   [+ add]    │
│ Fits 10 MW AC           ✓ 36.2 of 35.7 ac    ✓ 58.1 of 35.7 ac                  │
│ Tradeoff status         Frontier             Strong alternative                 │
│ Mapped ≥69 kV line      0.03 km ◂            0.06 km                            │
│ Mean usable slope       0.42° ◂              0.76°                              │
│ Usable / gross area     36.2 / 39.2 ac       58.1 / 87.1 ac                     │
│ Max capacity            10.1 MW AC           16.3 MW AC                         │
│ NWI-mapped overlap      0.0%                 32.0%                              │
│ EPA transmission (hist.) 0.02 mi             0.04 mi                            │
│ DEQ status              Recorded             Recorded                           │
└────────────────────────────────────────────────────────────────────────────────┘
```

* At most 3 columns. The `◂` marker shows the more favourable value on the two **objectives only**,
  in neutral text with no color.
* The rows are fixed (above); there is no column chooser.
* Entry points: "+ Compare" in the site header, "Compare these sites →" in the dominance block,
  and the `C` key on a selected site.

## 10. Methodology sheet (right Sheet, 560 px, opened from the header)

```
┌ Methodology & data ─────────────────────────────── ✕ ┐
│ SolarSight is a screening tool. It does not assess   │
│ interconnection capacity, permitting, wetland        │
│ jurisdiction, flood risk or site availability.       │
│ ▸ How candidates are selected (DEQ ≥10 ac; built-over│
│   and existing-solar sites removed; landfill/quarry  │
│   sets exploratory)                                  │
│ ▸ Project-size feasibility (0.35 MW DC = 0.28 MW AC  │
│   per usable acre; table 5/10/20/40 MW → acres)      │
│ ▸ Terrain (3DEP 10 m, Horn slope, % grade vs degrees)│
│ ▸ Grid proximity (OSM ≥69 kV, boundary-to-line; vs EPA)│
│ ▸ Mapped wetlands (NWI 1980s imagery; switch)        │
│ ▸ Pareto frontier & strong alternatives              │
│ ▸ Assumptions (rendered from meta.assumption_basis)  │
│ ▸ Data sources & vintages (table)                    │
│ ▸ Limitations & not assessed (FEMA, AEC)             │
└──────────────────────────────────────────────────────┘
```

Built from shadcn Sheet + Accordion. Content is static TSX, except Assumptions and Warnings, which
are rendered from `meta.json` so they cannot drift.

## 11. No-results state

```
│ MAP: all marks in screened style, no labels                                  │
│ ┌ centered overlay card ───────────────────────────────────────────────┐     │
│ │ No quarry sites fit a 20 MW AC project under these assumptions.      │     │
│ │ Largest fit in this set: 17.4 MW AC (Unnamed quarry, Craven Co.)     │     │
│ │ [Try 10 MW]  [Allow 15% grade → 1 site]  [Include NWI areas → 2]     │     │
│ └──────────────────────────────────────────────────────────────────────┘     │
```

The buttons are suggestions only; nothing changes until the user clicks. Each button is shown only
if it would actually change the result (checked by evaluating the scenario). The chart panel shows
"No feasible sites to compare".

## 12. Responsive strategy

| Width | Layout |
|---|---|
| ≥ 1280 | Full workspace as above. Left rail 340, right panel 400 (≥1600: 440), bottom panel 280 |
| 1024–1279 | Left rail 300. The right panel becomes a **non-modal overlay** over the map's right edge when a site is selected (✕ closes it). Bottom panel 240 |
| < 1024 | Full-screen map plus a top summary chip bar (tapping it opens Setup). A bottom **Sheet** has three tabs: Setup (controls + funnel), Site, Tradeoffs. Compare is hidden; Methodology is full-screen |

Mobile gets no separate design work beyond this; acceptance is "usable on a phone".

## 13. Map specification

* **Base**: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`; attribution
  "© OpenStreetMap contributors © CARTO" (plus "Candidate data: NC DEQ, US EPA, USFWS, USGS, OSM").
  Fit bounds `[-84.32, 33.84, -75.46, 36.59]` (padding 40); minZoom 5.5, maxZoom 16.
* **Fallback style** (`public/data/context.geojson`): NC outline + county lines, exported in M3 by a
  ~10-line addition to `export_app_data.py` from `data/raw/nc_*`. It is switched on when the
  style/tiles fail (map `error` event or a 6 s style timeout). A small "Offline basemap" notice is
  shown. Labels on candidate marks are disabled in fallback (no glyph server).
* **Sources**:
  * `candidates-pt`: a FeatureCollection of points built once at load from `latitude/longitude`;
  * `candidates-poly`: the GeoJSON as is.

  On scenario change, `setData` is called with `ui_state` and `rank` properties (≤ 662 features).
  `promoteId: "site_id"` is set so hover/selection use `setFeatureState` (no data re-upload on hover).
* **No clustering.** At ~660 points, clustering would hide the decision state.
* **Layers** (bottom → top):
  1. `poly-fill` (minzoom 10, opacity interpolates 0 → 0.35 over z10–12, color by state)
  2. `poly-line` (minzoom 10, 1 px state color; 2 px `--selected` when selected)
  3. `pt-screened` (radius 2.5 px, `--candidate-screened`, opacity 0.7; hidden when "Show screened-out sites" is off)
  4. `pt-feasible` (radius 4, `--candidate-feasible`, opacity 0.85)
  5. `pt-alternative` (radius 6, `--pareto-alternative`, 1 px `--surface` stroke)
  6. `pt-frontier` (radius 8, `--pareto-frontier`, 2 px `--surface` stroke)
  7. `pt-halo` (selected or hovered: radius = state radius + 5, transparent fill, stroke 2 px `--selected` for selected, 1.5 px `--text-primary` for hover; selection keeps the underlying fill)
  8. `label-frontier` (symbol, text = name, 12 px, `--text-primary` with 1.5 px halo `#0A1016`, offset right; also the selected site's label)

  Points stay visible at all zooms (a polygon is sub-pixel below ~z11). Points fade to 0.4 over
  z12–13 so the polygon reads.
* **Transitions**: `circle-color-transition` / `circle-radius-transition` 250 ms, so changing
  project size visibly "settles" marks.
* **Hover**: on `pt-*` layers and `poly-fill`, the cursor becomes a pointer and the hover card
  (custom div at pointer +12 px) shows:
  * name;
  * county;
  * glyph + state label;
  * "Fits 10 MW AC · 36.2 of 35.7 ac" or "Doesn't fit 10 MW AC";
  * "0.03 km to mapped ≥69 kV line";
  * "0.4° mean usable slope".

  It writes `hoveredId` (source `map`). It hides on leave or drag.
* **Click** sets `selectedId`. A click on empty map does nothing (✕ / Esc clears). On selection from
  the list or chart, the map `flyTo` the site if it is outside the viewport (zoom ≥ 9, 600 ms); a map
  click never moves the camera.
* **Legend** (bottom-left overlay, compact): ◆ Pareto frontier, ● Strong alternative,
  • Other feasible, · Screened out (with a toggle). It is the same glyph language as the chart.

## 14. Pareto visualization specification

* **States per site** (from the scenario):
  * `frontier` (layer 1);
  * `alternative` (layers 2–3, labelled **"Strong alternative"**, with the tooltip "Would be on the
    frontier if the frontier sites above it were unavailable");
  * `feasible` (layer ≥ 4, "Feasible — dominated");
  * `screened` (failed a screen; `screenReason` = not-in-set | built-over/existing-solar |
    too small | missing metric | cap).

  Layer numbers are never shown as ranks.
* Objectives: minimise `grid_line_distance_km` and `usable_mean_slope_deg_slope{T}`. Strict
  dominance; nulls excluded. There is no tolerance UI, because the default is off per methodology.
* An explanation is available for every dominated site; frontier sites get the "On the frontier"
  sentence.

## 15. Component inventory

```
app/page.tsx → <SolarSightApp>
├── DataGate                     loading / error / ready (zod-validated data into store)
├── AppHeader                    wordmark · ScenarioSummary chip · Methodology button · dataset version
├── Workspace (grid)
│   ├── ScreeningRail
│   │   ├── ProjectSizeSelector  (+ required-acres helper)
│   │   ├── TerrainThresholdSelector (+ % grade ⓘ)
│   │   ├── NwiToggle (+ ⓘ)
│   │   ├── CandidateSetSelect   (Brownfields / Landfills (exploratory) / Quarries (exploratory))
│   │   ├── MoreFilters          (max grid km slider w/ enable switch, max NWI % slider w/ switch, show screened-out)
│   │   └── CandidateFunnel
│   ├── MapPane
│   │   ├── SolarMap             (react-map-gl; sources/layers; feature-state sync)
│   │   ├── MapHoverCard
│   │   ├── MapLegend
│   │   ├── BasemapNotice        (fallback)
│   │   └── NoResultsOverlay
│   ├── BottomPanel (Tabs)
│   │   ├── TradeoffChart        (Recharts) + ChartHoverCard
│   │   └── ComparePanel
│   └── SitePanel
│       ├── SiteEmptyState       (frontier + alternatives quick list)
│       ├── SiteHeader           (name, place, type, StatusLine, Compare button)
│       ├── ProjectFit
│       ├── TradeoffPosition | DominanceExplanation
│       ├── MetricGroup "SolarSight analysis"
│       ├── EpaScreening         (collapsible)
│       ├── DeqRecord            (collapsible)
│       └── ScreeningNotes       (collapsible; warnings from meta + NotAssessed rows)
├── MethodologySheet
└── shared: SourceBadge, StatusGlyph, Metric, MetricRow, NotAssessed, InfoTip, formatters
lib/
├── data.ts        load + zod schema + point-collection builder
├── scenario.ts    computeScenario() — pure TS port of scenario.py
├── pareto.ts      dominance, layers, exampleDominator, explain()
├── format.ts      units/rounding rules (§18)
└── store.ts       zustand store
```

## 16. Component-library mapping

| Component | Implementation |
|---|---|
| ProjectSizeSelector | shadcn **ToggleGroup** (single), custom segmented styling |
| TerrainThresholdSelector | shadcn **ToggleGroup** |
| NwiToggle | shadcn **Switch** + label + **Tooltip** (InfoTip) |
| CandidateSetSelect | shadcn **Select** |
| MoreFilters | shadcn **Collapsible** + **Slider** + **Switch** |
| CandidateFunnel | custom (divs + CSS widths) |
| AppHeader / ScenarioSummary | custom; Methodology = shadcn **Button** (ghost) |
| SolarMap / layers / legend | **react-map-gl/maplibre** + custom legend div |
| MapHoverCard / ChartHoverCard | custom positioned div (not Radix) |
| TradeoffChart | **Recharts** ScatterChart, custom `shape` renderers, custom tooltip disabled (shared hover card) |
| BottomPanel tabs | shadcn **Tabs** |
| ComparePanel | custom semantic `<table>` |
| SitePanel sections | custom MetricGroups; EPA/DEQ/Notes = shadcn **Collapsible** |
| StatusGlyph / SourceBadge | custom (inline SVG glyph + text); *not* shadcn Badge for every value |
| NotAssessed / caveats | custom row with lucide `AlertTriangle` (no shadcn Alert boxes in panels) |
| MethodologySheet | shadcn **Sheet** + **Accordion** + `<table>` |
| Scroll areas | shadcn **ScrollArea** (site panel, methodology) |
| Mobile bottom sheet | shadcn **Sheet** (side="bottom") + **Tabs** |
| Icons | lucide: `Info`, `AlertTriangle`, `X`, `Plus`, `ArrowRight`, `ChevronDown`, `ExternalLink`, `Layers` |

shadcn components to add: `button toggle-group switch tooltip select collapsible slider tabs sheet
accordion scroll-area separator`. **No `card` and no `badge`** (to avoid the dashboard look).

## 17. State architecture

```ts
// zustand store (source state only)
scenario: { targetMwAc: 5|10|20|40|number; slopeThresholdPct: 5|10|15; excludeNwi: boolean;
            candidateSet: "brownfields_baseline"|"landfills_secondary"|"quarries_exploratory";
            maxGridKm: number|null; maxNwiPct: number|null; showScreened: boolean }
selectedId: string|null
hovered: { id: string; source: "map"|"chart"|"list" } | null
compareIds: string[]            // ≤3, insertion order
bottomTab: "tradeoffs"|"compare"; bottomOpen: boolean
methodologyOpen: boolean
data: { status: "loading"|"ready"|"error"; candidates: Candidate[]; byId: Map; meta: Meta; error?: string }
```

Derived state (never stored): `useScenarioResult()` = `useMemo(computeScenario(candidates,
scenario))`. It returns:
* `funnel {universe, baseline, sizeFeasible, screenEligible, frontier, alternatives}`;
* `results: Map<id, {inSet, baseline, sizeFeasible, screenEligible, screenReason, layer, uiState,
  dominatorId, deltas}>`;
* `frontierIds`, `alternativeIds`, `eligibleIds`, `requiredAcres`;
* `largestFeasibleMwAc` (for the no-results state).

Selectors read `results.get(selectedId)` and similar. Hover is excluded from the memo deps, so
hover never recomputes Pareto. A map↔store bridge `useEffect` mirrors `hovered`/`selectedId` into
`setFeatureState`.

Scenario keys used by `computeScenario`:
* `universe` = `site_type ∈ set.types && primary_source == set.source`;
* `baseline` = `candidate_status ∈ set.statuses`;
* usable column = `usable_acres_slope{T}` + (`excludeNwi` ? "" : `_nwi_not_excluded`);
* required acres = `target / (0.35/1.25)`.

## 18. Data-to-UI mapping

| Field(s) | Where | Format |
|---|---|---|
| `name`, `city`, `county`, `site_type` | hover card, site header, compare | text; county + " Co." |
| `usable_acres_slope{T}[ _nwi_not_excluded]` vs required | hover card, ProjectFit, compare | `36.2 ac` (1 dp) |
| `estimated_max_capacity_mw_ac` (recomputed for T/NWI: usable × 0.28) | ProjectFit, compare | `10.1 MW AC` |
| `annual_mwh_per_mw_ac` × target | ProjectFit (ⓘ "≈10% above observed NC fleet") | `≈ 17,900 MWh/yr` (nearest 100) |
| `grid_line_distance_km`, `nearest_line_kv` | hover, TradeoffPosition, analysis, chart x, compare | `< 1 km → 2 dp; ≥ 1 → 1 dp` + `· 230 kV` |
| `usable_mean_slope_deg_slope{T}` | hover, TradeoffPosition, chart y, compare | `0.4°` (1 dp; 2 dp in explanations when Δ < 0.1) |
| `mean_slope_deg`, `p90_slope_deg`, `steep_gt{T}pct_share` | SolarSight analysis | `°` 1 dp; share as % |
| `gross_area_acres`, `buildable_base_acres` | analysis, compare | ac 1 dp |
| `nwi_wetland_overlap_pct/acres`, `nwi_data_status`, `nwi_mapping_image_year` | analysis, compare | "0.0% of mapped boundary overlaps NWI wetland ({nwi_mapping_image_year} imagery)"; status ≠ assessed → "NWI analysis unavailable" |
| `building_coverage_pct` | analysis; screen reason | % 0 dp |
| `substation_distance_km`, `road_distance_km` | analysis (context rows) | km |
| `fema_flood_data_status` | analysis | "Flood exposure — not assessed" ⚠ |
| `aec_data_status` | DEQ record | "Areas of Environmental Concern — not available" |
| `candidate_status`, `status_reason`, `screening_confidence` | screen reason line, DEQ/notes | verbatim reason |
| `epa_*` | EPA section, compare (transmission only) | native units (mi, kV, kWh/m²/day); null → section empty state |
| `epa_match_method/confidence` | EPA section footer | "exact project ID (high)" etc. |
| `deq_*`, `source_id` | DEQ section | verbatim |
| `meta.assumptions/basis/warnings/fields` | Methodology, InfoTips, ScreeningNotes | rendered |

Fields **not** surfaced: raw OSM ids/tags, the slope-5/15 objective columns except via the T switch,
`metric_provenance` JSON (Methodology covers it), `dem_*`.

## 19. Empty / error / loading states

| State | Behavior |
|---|---|
| Loading | Full-viewport surface, wordmark, one line "Loading 662 candidate sites…". No progress bar. Data load and map init run in parallel; panels render as soon as the data is ready; the map area shows `--surface` until the style loads |
| Data error | Centered message with the zod/HTTP error summary and "Reload". Never a partial UI |
| Basemap error | Switch to the fallback style + "Offline basemap" notice; app otherwise unchanged |
| No site selected | SitePanel empty state: "Select a site on the map or chart", then quick lists of frontier and strong alternatives (click to select) |
| No feasible candidates | NoResultsOverlay (§11); chart "No feasible sites to compare"; funnel shows 0 rows normally |
| Selected site screened out | "Doesn't fit …" / "Screened out: built over (31% building coverage)" block; selection kept |
| No EPA match | "No historical EPA RE-Powering match for this project." (`ambiguous_*` → "Several EPA records nearby; none matched unambiguously.") |
| FEMA | "Flood exposure — not assessed" (warning glyph), always present |
| NWI missing | "NWI analysis unavailable" (none in the current data, but handled) |
| Compare empty | "Add sites with + Compare to see them side by side." |
| Exploratory sets | Funnel chip "Exploratory — few records have closure evidence" |

## 20. Accessibility

* Every control is a native button or Radix primitive: keyboard reachable, with a visible 2 px
  `--accent` focus ring (`:focus-visible`), ToggleGroup arrow keys and labelled Switches.
* Pareto state is never color-only: glyph shape (◆ ● • ·), text label, mark size and frontier name
  labels on the map. The legend is always visible.
* Tooltips are only supplementary; essential info (units, not-assessed) is inline.
* The chart has a keyboard path: the site panel's quick list and Compare table carry the same
  information; points get `aria-label`s ("Singer Site, frontier, 0.03 km, 0.4°"). An offscreen
  table of plotted points is provided for screen readers.
* Text contrast is ≥ 4.5:1 (muted 4.6:1); marks are ≥ 3:1 except screened marks (legend relief).
* `prefers-reduced-motion` disables map/CSS transitions and flyTo becomes jumpTo.
* Esc clears the selection (when no sheet is open); `C` adds the selection to compare;
  `[`/`]` step project size.

## 21. Performance plan

* Load GeoJSON once (2.2 MB; gzip ~0.5 MB) with `fetch` from `/data`. Zod parses once; points
  collection is built once.
* `computeScenario` is O(n²) for ≤ 361 eligible sites (≤ 130k comparisons), well under 2 ms, and is
  memoized on scenario inputs.
* Map: two GeoJSON sources, created once. Scenario changes call `setData` (reusing source objects);
  hover/selection use `setFeatureState` only. There are no React markers.
* Chart: ≤ 200 points. Hover state lives outside Recharts props: points re-render via
  `React.memo` + id comparison; the hover ring is a separate overlay `<Scatter>` with one point.
* MapLibre is loaded with `next/dynamic` (`ssr: false`). Recharts is client-only. The page is a
  static export.

## 22. Demo sequence (≈ 100 s)

1. **Problem (10 s).** The app is open at defaults. "I'm planning a 10 MW AC solar project in North
   Carolina; which brownfields deserve a closer look?" The map shows NC with two labelled frontier sites.
2. **Search space (15 s).** Point to the funnel: **434 brownfield projects → 361 not built over → 75
   fit 10 MW → 2 frontier (+6 strong alternatives)**. "Explicit requirements, not a hidden score."
3. **Frontier (15 s).** Point to the chart: "For these two, you can't get closer to transmission
   without accepting rougher terrain, or vice versa."
4. **Inspect (15 s).** Click **Singer Site** (Chocowinity): needs 35.7 ac and has 36.2. It sits on a
   230 kV line at 0.4° slope. Expand EPA: "EPA's historical screen agrees: 0.02 mi."
5. **Rejection (15 s).** Click **Carolina Creosoting Corp.** (Leland): "Dominated by Singer Site:
   0.03 km closer and 0.34° flatter; both fit." Click "Compare these sites →"; the Compare tab opens.
6. **Linked views (10 s).** Hover chart points: map marks light up. Hover the map: the chart ring
   follows.
7. **Change requirement (15 s).** Switch to **20 MW**:
   * funnel 75 → 34;
   * Singer Site shows "Doesn't fit your 20 MW AC project — needs 71.4 ac, has 36.2";
   * the frontier becomes **WestPoint Home (former)** + **Maxton Feed Mill**.

   Optional: flip *Include NWI-mapped areas*. Carolina Creosoting joins the 20 MW frontier, showing
   that the wetland assumption matters.
8. **Provenance (10 s).** Open Methodology → Assumptions (from meta) → close. "EPA values are labelled
   historical, our analysis is labelled, and FEMA is shown as not assessed — never as zero."

Avoid in the main path: Dorothea Dix Park (a city park; use only to illustrate "a brownfield record ≠ available").

## 23. Implementation order

| # | Milestone | Components / behavior | Acceptance criteria |
|---|---|---|---|
| M0 | Scaffold | `web/` Next 16 + TS + Tailwind 4 + shadcn init (+ listed components), Geist fonts, tokens in `globals.css`, `sync-data.mjs`, static export config, Vitest | `npm run dev` shows a token-styled empty shell; `npm run build` produces `out/`; lint/typecheck clean |
| M1 | Data + engine | `lib/data.ts` (zod), `lib/pareto.ts`, `lib/scenario.ts`, `lib/format.ts`, `store.ts` | Vitest: all **72** cases in `data/app/fixtures/scenario_expected.json` match (funnel, every rank, every example dominator); explain() unit tests (equal, rounds-to-zero, both better) |
| M2 | Shell + controls + funnel | AppHeader, ScreeningRail (all controls), CandidateFunnel, SitePanel empty state with frontier/alternative quick lists, DataGate | Changing size/T/NWI/set updates funnel counts to fixture values instantly; keyboard operable |
| M3 | Map | SolarMap (both sources, 8 layers, feature-state), legend, hover card, click-select, flyTo, fallback style + `context.geojson` export, NoResultsOverlay | States render per §13; hover/selection don't re-upload data; killing the network shows the fallback with the app still usable |
| M4 | Site panel | SiteHeader, ProjectFit, TradeoffPosition / DominanceExplanation, analysis group, EPA / DEQ / Notes collapsibles, all §19 states | Singer Site / Carolina Creosoting / Singer@20 MW render exactly as the §7 wireframes; no zeros for missing values |
| M5 | Tradeoff chart + linking | TradeoffChart (√ x-axis, glyphs, frontier step line, labels), hover/select both directions | Map hover ↔ chart ring within one frame; chart click selects and updates panel and map |
| M6 | Compare + Methodology | ComparePanel (≤ 3), "Compare these sites →", MethodologySheet with meta-driven Assumptions/Warnings | The demo steps 5 and 8 work end-to-end |
| M7 | Polish + resilience | transitions, reduced motion, responsive breakpoints, a11y pass, demo rehearsal, `out/` served with `npx serve` | The full §22 demo runs in ≤ 120 s twice in a row without errors; Lighthouse a11y ≥ 90 |

## 24. Risks (frontend/product only)

1. **Basemap is the only network dependency** at the venue. Mitigation: fallback style (M3), plus
   test with wifi off. A PMTiles offline basemap is a stretch goal, not planned.
2. **Small frontier (2)** could read as "the tool found nothing". Mitigation: strong alternatives
   always shown and counted, explanations on every dominated site, and the demo narrative.
3. **TS port diverging from Python** (dominator tie-breaking, null handling). Mitigation: M1 golden
   fixtures are a merge gate.
4. **react-map-gl 8 + MapLibre 6 + React 19/Next 16 SSR.** Mitigation: dynamic import with
   `ssr:false`; if react-map-gl misbehaves, fall back to a 60-line `useMaplibre` hook (same layer
   specs).
5. **sqrt x-axis readability.** Mitigation: explicit "√ scale" label and ticks at round values.
6. **Projector washout of the dark UI.** Mitigation: contrast-checked tokens; check on an external
   display during M7.
7. **Overlapping points at 0 km** (29 of 75 at 10 MW). They share x but differ in y; no jitter
   (honest). Hover hit-radius is 8 px, and the nearest point wins.

## 25. Final UI specification (frozen)

* **Stack**: Next 16 static export · React 19 · TS · Tailwind 4 tokens · shadcn (button, toggle-group,
  switch, tooltip, select, collapsible, slider, tabs, sheet, accordion, scroll-area, separator) ·
  lucide · maplibre-gl 6 + react-map-gl 8 · CARTO Dark Matter + local fallback · Recharts 3 ·
  Zustand 5 · Zod 4 · Vitest. Nothing else.
* **Layout**: header 56 · left rail 340 (project size, terrain % grade, NWI switch, candidate set,
  more filters, funnel) · map (center) with bottom tabbed panel 280 (Tradeoffs | Compare) · right
  site panel 400. Map-first, docked, dark.
* **Defaults**: 10 MW AC, ≤10% grade, NWI excluded, Brownfields, screened-out shown dim, no
  selection, bottom panel open.
* **Engine**: client-side port of `scenario.py` + `pareto.py`, verified by 72 golden cases.
  Objectives are grid km ↓ and usable-land slope ° ↓; strict dominance; layers 1 = Frontier,
  2–3 = Strong alternative, ≥ 4 = Other feasible.
* **Encodings**: ◆ amber `#C4862A` frontier · ● cyan `#2E9BBA` strong alternative · • `#8A99A8`
  other feasible · · `#3D4955` screened out · white ring = selected · light ring = hovered. The same
  glyphs appear on the map, chart, legend and panel.
* **Linking**: a single store for `selectedId`, `hovered` and `compareIds`. Map and chart both read
  and write it. Selection survives scenario changes and shows "doesn't fit" when infeasible.
* **Site panel order**: header + status → project fit → tradeoff position / dominance explanation →
  SolarSight analysis → EPA (historical, collapsed) → DEQ (collapsed) → screening notes.
* **Honesty rules**:
  * missing values render as explicit text, never 0;
  * EPA values carry an "EPA historical" badge and native units;
  * DEQ status is shown verbatim;
  * FEMA always shows "not assessed";
  * no score, rank number, "best" or knee label.

## Amendment A1 — zero grid distance is a geometric state (post-freeze)

* **Meaning:** `grid_line_distance_km === 0` means a mapped ≥69 kV line intersects the site boundary.
* **Text:** it is never shown as "0.00 km". The UI shows "Mapped ≥69 kV transmission intersects
  site boundary", or "Intersects site boundary" / "Intersects" where a label already names the line.
  Non-zero values read "1.42 km from site boundary"; a tiny non-zero value reads "< 0.01 km".
* **Explanations:** dominance text says "a mapped ≥69 kV line intersecting its boundary…".
* **Tradeoff chart:** these sites keep their true x = 0, and the zero tick reads "Intersects".
* **Selected site on the map:**
  * the site outline at every zoom;
  * the nearest mapped ≥69 kV line plus any line crossing the site, violet `#c084fc` with a dark casing;
  * when the distance is above zero, a dashed connector for the measured shortest boundary-to-line segment;
  * legend rows while a site is selected;
  * "Show on map" in the site panel frames the site and the line.
* **Data:** from `data/app/grid_context.geojson`, which is display only and optional. If it is missing,
  the panel says "Line geometry unavailable."
* **Methodology:** states that grid distance is polygon-boundary-to-line and only a proximity
  screening proxy. EPA's NC brownfield distances are described as boundary-based, not point-based.
* **Pareto:** the calculation is unchanged. Zero-distance sites are ties on that objective.

## Amendment A2 — final product functionality (Compare overhaul; post-freeze)

The methodology, Pareto objectives and golden outputs are unchanged. This amendment changes presentation and
interaction only.

* **Project requirements:** the left rail is titled "Project requirements" and has these controls:
  * Project size (MW AC);
  * Maximum terrain grade (5/10/15%);
  * Wetland screening;
  * Candidate type;
  * an "Optional constraints" disclosure holding the former "More filters".

  The funnel keeps the stage "Pass baseline land screen".
* **Selected-site panel**, in order:
  1. header with **Add to Compare** / **✓ In Compare Ⓐ|Ⓑ**;
  2. **project fit** banner: FITS / DOESN'T FIT YOUR N MW PROJECT, with the reason;
  3. required usable land, available usable land, then land margin or shortfall;
  4. **Pareto status**: frontier, strong alternative, feasible (dominated), or not in the tradeoff analysis, with the active objective values.
     * Frontier sites show the non-superlative frontier explanation and "Compare with ⟨other frontier site⟩".
     * Dominated sites show "DOMINATED BY ⟨dominator⟩", "⟨dominator⟩ is:" with the real differences, and **Compare with ⟨dominator⟩**.
  5. SolarSight analysis, then EPA historical and DEQ source sections.
* **Compare is A ↔ B:**
  * Membership is explicit: selecting a site never adds it to Compare or removes one.
  * There are two slots, Ⓐ and Ⓑ. The letters are identities, not ranks, and stay stable when the other slot is removed.
  * A third site cannot be added until one is removed.
  * "Compare with ⟨dominator⟩" sets Ⓐ to the dominator and Ⓑ to the dominated site, then opens Compare, in one action.
* **Compare tray:** a persistent "Compare" card over the map's top-left lists Ⓐ / Ⓑ with remove buttons and
  "Select another site to compare". With two sites it offers "Compare sites →".
* **Compare panel** (bottom workspace, grows to ~44% height):
  * Table:
    * project fit: fits, required land, available land, margin/shortfall;
    * active tradeoffs: grid proximity and mean usable slope, with ✓ on the better value;
    * environmental context: NWI overlap, FEMA not assessed;
    * historical EPA distance, labelled as not used in this decision.
  * "Why they differ" box (`lib/decision/decision.ts`):
    * **Why Ⓐ dominates Ⓑ:** per-objective values, the dominance definition, and "Choosing ⟨B⟩ instead of ⟨A⟩ gives up …, with no gain on either active objective."
    * **Why both are on the frontier / Why neither dominates:** ✓/✕ per objective with values, and "Improving one objective requires sacrificing the other."
    * **Why they can't be traded off:** shown when a site doesn't fit or is screened; it gives the fit, required/available land and margin/shortfall for each site.
* **Dynamic behaviour:**
  * Changing project requirements recomputes everything, including the selected site and both compared sites.
  * Neither the selection nor Compare is cleared.
  * There is no scenario diff or changelog.
* **Linked identities:**
  * Map: Ⓐ/Ⓑ canvas badges next to the points (they work without a glyph server), and "Show both on map" frames both sites.
  * Chart: Ⓐ/Ⓑ badges on the points. Compared sites that no longer fit stay plotted, dashed, as "doesn't fit".
* **Below 1280 px:** the overlaid site panel stops above the tradeoff/compare panel, so the comparison stays visible.
