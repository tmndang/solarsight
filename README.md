# SolarSight — feasibility spike

Geospatial screening of **previously disturbed land in North Carolina** (landfills, brownfields,
quarries) for solar, using **Pareto tradeoffs** instead of a weighted suitability score.

This repository currently contains the *data-feasibility phase* only: real data, the processing
pipeline, a reusable Pareto module, and the go/no-go analysis. No frontend yet.

* Decision and findings: [`docs/DATA_FEASIBILITY.md`](docs/DATA_FEASIBILITY.md)
* Sources tested: [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)
* Method: [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md)
* Generated analysis: [`docs/analysis/pareto_report.md`](docs/analysis/pareto_report.md)

## Output

`data/processed/feasibility_sites.parquet` — GeoParquet (EPSG:4326), one row per real candidate
polygon with metrics and provenance. `data/processed/pareto_results.parquet` — per objective-set
model, every site's Pareto status/rank/example dominator. These are committed so the app can run
offline.

## Reproduce

```bash
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cd scripts
python download_overture.py all          # OSM-derived layers from Overture S3 (~400 MB raw)
python preprocess_candidates.py          # -> data/processed/candidates.parquet
python download_elevation.py             # 3DEP 1/3" windows per site (24 MB)
python compute_terrain.py                # -> data/processed/terrain.parquet
python download_solar_resource.py meta   # NSRDB NC pixel table
python download_solar_resource.py sites  # NSRDB TMY 8760 h per needed pixel (~15-30 min)
python download_eia.py                   # EIA-860/923 NC PV (validation) via PUDL
python compute_metrics.py                # -> data/processed/feasibility_sites.parquet
python analyze_pareto.py                 # -> pareto_results.parquet, docs/analysis/*
cd .. && python -m pytest -q
```

All downloads are public, anonymous S3 reads (no API keys). Only `compute_metrics.py` onward is
needed to rebuild outputs once `data/raw/` is cached.

Data © OpenStreetMap contributors (ODbL) via Overture Maps; USGS 3DEP; NREL NSRDB; EIA via
Catalyst Cooperative PUDL (CC-BY-4.0).
