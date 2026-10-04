# SolarSight

A transparent decision layer on top of EPA RE-Powering for **North Carolina brownfields**. For a
solar project of a stated size (MW AC), SolarSight:

1. combines current NC DEQ Brownfields project boundaries with EPA RE-Powering screening attributes;
2. adds USGS 3DEP terrain analysis, USFWS NWI wetland overlap and current mapped-transmission
   proximity;
3. removes sites that cannot host the project;
4. shows the Pareto tradeoffs (transmission proximity vs terrain) among the rest.

There is no weighted suitability score. SolarSight is a screening tool: it says nothing about
interconnection capacity, permitting, wetland jurisdiction, flood risk (not yet assessed) or site
availability.

* Decision & frozen spec: [`docs/DATA_FEASIBILITY.md`](docs/DATA_FEASIBILITY.md)
* Audit (validated / assumed / missing / not represented): [`docs/FOUNDATION_AUDIT.md`](docs/FOUNDATION_AUDIT.md)
* Method: [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) · Sources: [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)
* Generated analysis: [`docs/analysis/foundation_report.md`](docs/analysis/foundation_report.md)
* Frontend spec (frozen): [`docs/UI_SPEC.md`](docs/UI_SPEC.md) · TS-port golden cases: `data/app/fixtures/scenario_expected.json` (`scripts/export_scenario_fixtures.py`)

## Run the app

The web app (`web/`) is a static Next.js export. All candidate data, scenario logic and Pareto
analysis run in the browser from `data/app/`. Only the basemap tiles come from the network, and
local county outlines replace them when that fails.

```bash
cd web
npm install
npm run build && npm start      # production build served at http://localhost:3000
# or: npm run dev               # development server
npm test                        # unit + golden-parity tests (Vitest)
npm run e2e                     # demo-path browser test against a running build (E2E_URL, default :3000)
```

See [`web/README.md`](web/README.md) for structure, deep links and deviations from the UI spec.

## Outputs

| File | What |
|---|---|
| `data/app/candidates.geojson`, `data/app/meta.json` | frozen offline app dataset (662 candidates, field dictionary, assumptions, warnings) |
| `data/app/grid_context.geojson` | display-only transmission geometry per candidate: nearest mapped ≥69 kV line and any line crossing the site, plus the shortest boundary-to-line segment |
| `data/processed/feasibility_sites.parquet` | canonical candidate table (GeoParquet, EPSG:4326) |
| `data/processed/deq_epa_match.parquet` | all 1,363 DEQ projects with EPA match method and confidence |
| `data/processed/candidates.parquet`, `terrain.parquet`, `grid_proxy_validation.parquet` | intermediates |

Scenario results (feasibility, Pareto) are computed per scenario (`src/analysis/scenario.py`).
They are not stored in the canonical table.

## Reproduce

Raw inputs: the manually downloaded NC DEQ, EPA RE-Powering (GDB + `DataRecords.csv`) and NWI
geodatabases in `data/raw/` (Git LFS: run `git lfs pull`), plus public S3 downloads.

```bash
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cd scripts
python ingest_authoritative.py           # DEQ + EPA NC -> data/interim
python download_overture.py all          # OSM-derived layers (Overture S3)
python download_buildings.py             # building footprints touching candidates (~15 min)
python preprocess_candidates.py          # reconcile, match, status -> candidates.parquet
python download_elevation.py             # 3DEP windows
python compute_terrain.py                # slope, usable area, NWI/water/building overlaps
python download_solar_resource.py meta && python download_solar_resource.py sites   # NSRDB cache
python download_eia.py                   # validation only
python compute_metrics.py                # -> feasibility_sites.parquet
python export_app_data.py                # -> data/app/
python export_grid_context.py            # -> data/app/grid_context.geojson (selected-site transmission geometry)
python analyze_foundation.py             # validation report (optional)
cd .. && python -m pytest -q
```

Data: © OpenStreetMap contributors (ODbL) via Overture Maps; NC DEQ; US EPA; USFWS NWI; USGS 3DEP;
NREL NSRDB; EIA via Catalyst Cooperative PUDL (CC-BY-4.0).
