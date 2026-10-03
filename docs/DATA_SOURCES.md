# Data sources — tested in the feasibility spike

Tested on 2026-10-03 from a cloud container whose egress policy **blocked most `.gov` web hosts**
(epa.gov, fws.gov, fema.gov, nrel.gov / developer.nrel.gov, eia.gov, nconemap.gov, census.gov,
usgs.gov web pages, `*.arcgis.com`, data.gov), plus openstreetmap.org/Overpass and Geofabrik.
Reachable: AWS S3 public buckets, GitHub, PyPI. Every source below was **actually loaded**
unless marked *not reachable*. Hosts marked *not reachable* were not judged on quality; we
simply could not test them here and they need re-testing from an unrestricted network.

Status key: **USE** = recommended for the app, **VALIDATION** = used for checking only,
**CONTEXT** = shown but not optimised, **BLOCKED** = not reachable from this environment.

---

## 1. Candidate sites — OpenStreetMap disturbed-land polygons (via Overture Maps) — **USE (with caveats)**

| | |
|---|---|
| Organization | OpenStreetMap contributors, redistributed by Overture Maps Foundation |
| Dataset | Overture `base/land_use`, release `2026-09-23.1` |
| Access | `s3://overturemaps-us-west-2/release/2026-09-23.1/theme=base/type=land_use/` (anonymous, GeoParquet). Read with `pyarrow.dataset` using bbox-column row-group pruning (`scripts/download_overture.py`). DuckDB's `httpfs` extension could not be downloaded here, so pyarrow is used. |
| Fields used | `id`, `geometry` (WKB), `subtype`, `class` (`landfill`, `brownfield`, `quarry`), `names.primary`, `source_tags` (raw OSM tags: `operator`, `abandoned`, `disused`, `description`, `demolished:power`, `ref:US:EIA`, …), `sources[0].record_id` (OSM way/relation id) |
| Geometry | Polygon / MultiPolygon, EPSG:4326 |
| Coverage | NC: 87 landfill, 170 brownfield, 182 quarry polygons whose representative point is in NC; 268 kept at >= 5 gross acres after overlap de-duplication |
| Licence | ODbL 1.0 (attribution "© OpenStreetMap contributors"; share-alike on derived databases) |
| Update | OSM edits up to the release snapshot (Overture `version` 2026-09-06) |
| Limitations | (1) **Not an authoritative contamination/brownfield register.** OSM `landuse=brownfield` means "previously developed land awaiting redevelopment", not an EPA/NC DEQ brownfield designation. (2) **Operational status is mostly unknown**: only 20/268 carry lifecycle tags. Many quarries are operating aggregate pits (Martin Marietta, Vulcan, Wake Stone) and some landfills are active MSW landfills. (3) Completeness is volunteer-driven and uneven. (4) Outline precision is digitiser-dependent (generally imagery-traced; good enough for 10 m raster statistics, not for parcel/legal boundaries). |
| Recommendation | Use as the polygon source for the hackathon, labelled as "mapped disturbed land". Add EPA RE-Powering when reachable (below) to attach authoritative site program/status where points fall inside polygons. |

## 2. EPA RE-Powering America's Land screening dataset — **BLOCKED**

| | |
|---|---|
| Organization | U.S. EPA, RE-Powering America's Land Initiative |
| What exists (from web search, not downloaded) | Downloadable screening spreadsheet (>130,000 contaminated lands, landfills, mine sites) and the RE-Powering Mapper; ArcGIS feature services e.g. `services.arcgis.com/cJ9YHowT8TU7DUyn/.../RE_Powering_Mapper_Sites_2022/FeatureServer/0` and `services1.arcgis.com/IAQQkLXctKHrf8Av/.../EPA_RE_Powering_Screening_Dataset/FeatureServer`. EPA's attribute appendix (search snippet) describes an acreage field and "Estimated PV Capacity (MW)" based on 6.9 acres/MW. |
| Tested | `www.epa.gov`, `services.arcgis.com`, `services1.arcgis.com`, `edg.epa.gov`, data.gov, databasin, amerigeoss: all HTTP 403 at the egress proxy. **No records were loaded; NC count, geometry type (believed point), and fields are unverified.** |
| Recommendation | First task for anyone on an open network: download the NC subset and test whether it is points-only. Expected role: authoritative site program/status attributes joined to OSM polygons; do not invent polygons around points. |

## 3. Grid infrastructure — OSM power lines & substations (via Overture) — **USE (as proximity proxy only)**

| | |
|---|---|
| Dataset | Overture `base/infrastructure`, `subtype = power`, release `2026-09-23.1` |
| Fields used | `class` (`power_line`, `substation`, `plant`, `generator`), `source_tags.voltage` (semicolon list in volts; max taken), `plant:source` / `generator:source` |
| Geometry | `power_line`: LineString; `substation`: mostly Polygon; `plant`/`generator`: Polygon/Point |
| Coverage (NC bbox) | 14,899 `power_line` LineStrings, 89% voltage-tagged; 11,220 at >= 69 kV. 4,570 substations, 3,142 tagged >= 69 kV. 1,178 plants (1,003 carry `ref:US:EIA`). 19,920 solar plant/generator polygons. |
| Licence | ODbL 1.0 |
| Accuracy | Traced from imagery / tower positions; typically metre- to tens-of-metres level for transmission. Completeness of `power=line` (transmission) in the US Southeast is good; `minor_line` (distribution) is sparse and **not used**. |
| What it does NOT tell you | Capacity, hosting capacity, queue position, interconnection cost or feasibility, ownership agreements, substation transformer headroom. |
| Validation | Operating NC PV plants (EIA-860 coordinates, via PUDL) measured against the same layers: see DATA_FEASIBILITY.md. |
| Recommendation | Use. Label "distance to mapped >= 69 kV line / substation (OpenStreetMap)". |

## 4. HIFLD Electric Power Transmission Lines — **BLOCKED / deprecated**

HIFLD Open was deactivated in 2025 (per search results; mirrors exist at data rescue projects and
ICPSR/DataLumos). Not reachable here. Not needed given OSM coverage; could be used to cross-check line positions.

## 5. Elevation — USGS 3DEP 1/3 arc-second DEM — **USE**

| | |
|---|---|
| Organization | U.S. Geological Survey, 3D Elevation Program |
| Access | `https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n{lat}w{lon}/USGS_13_n{lat}w{lon}.tif` — public S3, cloud-optimised GeoTIFF (512 px tiles, overviews), read with rasterio `/vsicurl/` windowed reads (`scripts/download_elevation.py`) |
| CRS / resolution | EPSG:4269 (NAD83 geographic), 9.259e-5 deg (1/3 arc-second, ~10 m), float32 metres, nodata −999999 |
| Coverage | All 268 candidates; 100% valid pixels inside polygons. Example tile `n36w079` last modified 2025-05-07. |
| Limitations | Seamless product mixes lidar acquisition dates; **landfill and quarry topography changes quickly**, so slopes describe the surface at survey time. |
| Recommendation | Use. Cache per-site clips (24 MB for 268 sites) — no runtime dependency. |

## 6. Solar resource — NREL NSRDB GOES v4.0.0 TMY-2024 — **USE**

| | |
|---|---|
| Organization | NREL (National Solar Radiation Database), AWS Open Data |
| Access | `https://nrel-pds-nsrdb.s3.us-west-2.amazonaws.com/GOES/tmy/v4.0.0/nsrdb_tmy-2024.h5` (928,896,657,438 bytes). Opened with h5py over fsspec HTTP range requests (`scripts/download_solar_resource.py`). |
| Fields used | `meta` (latitude, longitude, elevation, timezone, state), `time_index`, `ghi`, `dni`, `dhi`, `air_temperature`, `wind_speed` (scaled ints; divided by `psm_scale_factor`) |
| Resolution | 0.04 deg grid (~4 km) as observed in `meta`; 8,760 hourly values, timestamps UTC at hh:30 |
| Coverage | 7,948 pixels flagged North Carolina; 217 unique nearest pixels for the 268 candidates |
| Limitations | Typical-year data (not a forecast); 4 km pixel smooths local horizon shading. NREL's PVWatts web API and `developer.nrel.gov` were blocked, so PVWatts was run locally via PySAM. |
| Recommendation | Use (cache the per-pixel 8760 files; ~125 KB each). |

## 7. PV performance model — NREL PVWatts v8 via PySAM — **USE**

`NREL-PySAM==7.1.1.post1` (`PySAM.Pvwattsv8`), executed locally. Same engine as the PVWatts API; no API key or network needed. Inputs listed in `src/analysis/assumptions.py`.

## 8. EIA-860 / EIA-923 via Catalyst Cooperative PUDL — **VALIDATION**

| | |
|---|---|
| Access | `s3://pudl.catalyst.coop/nightly/out_eia__yearly_generators.parquet`, `core_eia860__scd_generators_solar.parquet` (nightly build dated 2026-10-03) |
| Fields used | `plant_id_eia`, `generator_id`, `report_date`, `prime_mover_code`(=PV), `state`(=NC), `capacity_mw`, `net_capacity_mwdc`, `capacity_factor`, `net_generation_mwh`, `latitude`, `longitude`, `operational_status`, `uses_technology_fixed_tilt`, `uses_technology_single_axis_tracking`, `tilt_angle_deg` |
| Coverage | 934 NC PV plants, 9,942 generator-years (2007–2026 report dates) |
| Use | (a) observed NC capacity factors to validate PVWatts; (b) median NC tilt (20°) and fixed-tilt prevalence; (c) yardstick for grid distances; (d) flags EIA PV plants already inside a candidate polygon. |
| Licence | PUDL data CC-BY-4.0; underlying EIA data public domain. |

## 9. Roads — OSM via Overture `transportation/segment` — **CONTEXT**

`subtype = road`, classes motorway, trunk, primary, secondary, tertiary, residential, unclassified,
living_street (service/track excluded). LineString, ODbL. Median candidate distance is ~10 m, so
it does not discriminate between sites.

## 10. Water — OSM via Overture `base/water` — **USE as usable-area exclusion**

Polygon water bodies (ponds, flooded pits, reservoirs). ODbL. Used to remove open water from usable area.

## 11. Wetlands — **GAP**

* USFWS National Wetlands Inventory (`fws.gov`, `fwspublicservices.wim.usgs.gov`): **BLOCKED**.
* Fallback tested: OSM `natural=wetland` (Overture `base/land`, `subtype = wetland`): 28,095 polygons in the NC bbox but only 39 near candidates and mean overlap 0.07%. OSM wetland mapping is far from complete and has no jurisdictional meaning. Used only as a usable-area exclusion where present; **not defensible as an objective or a "wetland_overlap_pct" claim.**

## 12. Flood hazard — **GAP**

FEMA NFHL (`hazards.fema.gov`, `msc.fema.gov`) and NC Flood Risk Information System: **BLOCKED**. No
credible substitute was found on reachable hosts. `flood_exposure_pct` is stored as NaN with
`flood_source = "unavailable"`. When reachable, FEMA SFHA (Zone A/AE/VE) overlap % is a defensible
*context* metric (mapped 1%-annual-chance regulatory floodplain, not a probability forecast).

## 13. Boundaries — Overture `divisions/division_area` — **USE (display/labels)**

NC `region` land polygon (US-NC) and 100 county polygons; ODbL.

## Sources looked at and not used

ESA WorldCover (S3 reachable) — 10 m land cover; its "herbaceous wetland" class misses forested
wetlands, which dominate NC, so it was not used as a wetland proxy. NLCD (mrlc.gov) blocked.
