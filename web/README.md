# SolarSight web app

This is the implementation of [`docs/UI_SPEC.md`](../docs/UI_SPEC.md). It is a static Next.js export with no backend.

```bash
npm install
npm run build && npm start   # http://localhost:3000 (serves out/)
npm run dev                  # development
npm test                     # Vitest: engine, explanations, formatting, 72 golden-parity cases
npm run typecheck && npm run lint
npm run e2e                  # browser demo test; needs a running build (E2E_URL=http://localhost:3000)
```

`predev`/`prebuild` run `scripts/sync-data.mjs`. It copies `../data/app/{candidates.geojson,meta.json,context.geojson,grid_context.geojson}`
into `public/data/` and copies the MapLibre worker into `public/maplibre/`. Both directories are generated and git-ignored.

## Structure

| Path | Role |
|---|---|
| `lib/data` | Zod schema (rejects non-numeric metrics, duplicate IDs), loading, memoised scenario result |
| `lib/scenario`, `lib/pareto` | Port of `src/analysis/scenario.py` and `src/analysis/pareto.py`, checked against `data/app/fixtures/scenario_expected.json` |
| `lib/decision` | Project fit (margin/shortfall), exclusion reasons, pairwise A/B interpretation (dominance / tradeoff / not comparable), consequence sentences |
| `lib/explanations`, `lib/formatting` | Dominance sentences from real values; unit formatting (missing values are never shown as 0) |
| `store/app-store.ts` | Zustand: scenario, selection, hover (map / chart / list), compare, panels |
| `components/` | `controls` (rail, funnel), `map`, `site`, `tradeoffs`, `compare`, `methodology`, `shell`, `ui` (Radix wrappers) |

## Using the app

* Deep links: `?mw=20&site=DEQ-02005-98-007`.
* Keyboard: `[` / `]` change the project size, `c` adds or removes the selected site in Compare (Ⓐ/Ⓑ), and `Esc` closes the panel or clears the selection.
* Layout: three columns at 1280 px and wider. Between 1024 and 1279 px the site panel overlays the map. Below 1024 px a "Setup" sheet and a bottom site overlay are used.

## Deviations from UI_SPEC

* Amendment A2 (in UI_SPEC): Project requirements language, explicit A ↔ B Compare (tray, "Compare with ⟨dominator⟩", frontier tradeoff explanation, Ⓐ/Ⓑ badges on map and chart). Decision logic lives in `lib/decision/decision.ts`.
* Amendment A1 (in UI_SPEC): grid distance 0 is shown as "Mapped ≥69 kV transmission intersects site boundary", and the chart's zero tick reads "Intersects". The selected site shows its transmission geometry from the optional `grid_context.geojson`.
* Radix primitives are wrapped by hand in `components/ui/primitives.tsx` instead of being generated with the shadcn CLI, because the registry was unreachable from the build environment. The tokens and behaviour are the same.
* Geist is loaded from the `geist` npm package instead of Google Fonts, so the app works offline.
* The MapLibre web worker is shipped as a static file and loaded with `setWorkerUrl`, because bundler resolution of it failed in the static export.
* Frontier sites are drawn as a diamond symbol on the map, matching the chart glyph. Map labels reuse the font of the loaded basemap style, and are omitted on the local fallback basemap.
* The fallback basemap is `data/app/context.geojson` (NC county outlines). The app switches to it after a style error or a 6 s timeout.
* Per the implementation directive:
  * no line connects Pareto points;
  * the funnel stage reads "Pass baseline land screen";
  * the UI shows no rank numbers;
  * the x-axis has no 0.1 km tick.
* Data fixes made while building the app:
  * `export_app_data.py` now exports numbers at full precision, because 4-dp rounding created false ties that broke the Pareto tie-break;
  * the fixture generator no longer writes NaN.
