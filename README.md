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

## AI usage

Per the WolfHacks rules, this section cites AI use. All of it happened during the hackathon.

**Tool:** [Claude Code](https://claude.com/claude-code), Anthropic's AI coding agent. It ran in a cloud session
connected to this repository.

**What the AI wrote.** Claude Code wrote and committed essentially all code and documentation in this
repository. Its commits are authored as `Claude <noreply@anthropic.com>`. This covers:

* the Python data pipeline (`scripts/`, `src/`): data downloads and ingestion, DEQ ↔ EPA matching, terrain and
  slope analysis, NWI overlap, transmission distances, PVWatts generation estimates, Pareto analysis and the app
  data export;
* the Python and TypeScript tests, including the golden scenario fixtures that check the web engine against the
  Python reference;
* the documentation in `docs/`: data sources, methodology, feasibility and foundation audits, UI spec and
  amendments;
* the web app (`web/`): Next.js/React UI, map, tradeoff chart, Compare, and the TypeScript port of the scenario
  and Pareto logic.

**What the team did.**

* Defined the product idea and wrote the phase-by-phase directives the AI implemented: data feasibility,
  foundation consolidation, UI spec, frontend build, and final functionality.
* Made the product and methodology decisions: no weighted score, Pareto layers instead of ranks, the funnel
  wording, no line connecting frontier points, and treating a grid distance of 0 as "intersects".
* Raised the question about how EPA measures its NC brownfield distances, which led to correcting the docs.
* Reviewed the AI's reports and results.
* Manually downloaded the source datasets the pipeline depends on and committed them in `data/raw/` (Git LFS):
  * NC DEQ Brownfields geodatabase;
  * EPA RE-Powering geodatabase and `DataRecords.csv`;
  * USFWS NWI North Carolina geodatabase.

**How AI output was checked.** The AI's output was not accepted on trust. It is checked by:

* Python tests (`pytest`);
* web unit tests, including all 72 golden scenario cases (`npm test`);
* an end-to-end browser test of the full demo path (`npm run e2e`);
* independent recomputation of key metrics (for example, brute-force distance checks and EPA comparisons in
  `docs/analysis/foundation_report.md`).

**No AI at runtime.** SolarSight contains no AI or LLM. Every number, classification and explanation in the app
is computed deterministically from the local data and the documented rules. The dominance and tradeoff
sentences are filled-in templates built from the actual values, not generated text.

Data: © OpenStreetMap contributors (ODbL) via Overture Maps; NC DEQ; US EPA; USFWS NWI; USGS 3DEP;
NREL NSRDB; EIA via Catalyst Cooperative PUDL (CC-BY-4.0).
