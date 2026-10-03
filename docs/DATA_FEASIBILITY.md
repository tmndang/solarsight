# SolarSight — data feasibility (phase 1)

Question: *Can we produce a small dataset of REAL North Carolina candidate locations with
sufficiently credible metrics to make the Pareto-siting concept technically defensible?*

Short answer: **yes for candidates, terrain, energy and grid proximity; no (yet) for wetlands and
flood. The Pareto idea works, but not in the form first hypothesised** — see the decision gate.

All numbers below come from `data/processed/feasibility_sites.parquet` and
`docs/analysis/pareto_report.md` (regenerate with `scripts/analyze_pareto.py`).

Environment note: this spike ran behind an egress policy that blocked epa.gov, fws.gov, fema.gov,
nrel.gov, eia.gov, nconemap.gov, `*.arcgis.com` and OpenStreetMap servers. Everything here was
obtained from public S3 buckets (Overture/OSM, USGS 3DEP, NREL NSRDB, Catalyst PUDL). Blocked
sources are **untested, not rejected**.

---

## Candidate sites — what works

* **268 real NC polygons** (OSM `landuse=landfill|brownfield|quarry` via Overture `2026-09-23.1`),
  after clipping to NC, removing polygons >= 50% inside a larger one, and dropping < 5 gross acres:
  153 quarries, 78 landfills, 37 brownfields. Polygons, not points, so area/slope/overlap are real
  polygon statistics.
* Examples that check out: South Wake Landfill (701 ac), Johnston County Landfill, Charlotte Motor
  Speedway Landfill, Duke's former Cape Fear coal plant (353 ac brownfield), Edgecombe Genco
  (retired coal plant, OSM even carries its EIA id), coal-ash structural fills at Brickhaven and
  Colon mines, retired ash basins.
* **Weaknesses (important):**
  1. Not an authoritative register. OSM "brownfield" ≠ EPA/NC DEQ brownfield designation.
  2. **Operational status is unknown for 248/268** (only 20 carry lifecycle tags). Many quarries are
     operating aggregate pits (Martin Marietta, Vulcan, Wake Stone); Aurora Mine is an operating
     phosphate mine; South Wake is an active MSW landfill; "WH U 0015" is a USACE military landfill.
     Mapped disturbed land is not the same as available land.
  3. EPA RE-Powering (the intended authoritative source) could not be loaded here. Its NC count,
     geometry type (believed points) and fields are unverified.

## Solar production — what works

* NREL NSRDB GOES v4.0.0 TMY-2024 read straight from S3 (h5py range reads, 217 pixels at 0.04°),
  PVWatts v8 run locally with PySAM. No API key, fully cacheable.
* Modelled AC capacity factor across candidates: median 0.203 (range 0.184–0.215).
* **Validation against reality:** for 92 operating NC fixed-tilt PV plants (EIA-860/923 via PUDL),
  running the same model with each plant's own tilt and DC/AC gives modelled/observed CF median
  **1.10** (p10 1.01, p90 1.25), r = 0.57. The model is ~10% optimistic (availability, curtailment,
  degradation and TMY-vs-actual weather are not modelled). The bias is roughly uniform, so it does
  not change rankings; the UI should call the output "estimated" and can show the 10% gap.
* **Energy ≈ acreage.** Specific yield varies only 1,290–1,503 kWh/kWdc (CV 2.2%).
  r(log MWh, log usable acres) = 0.9998; site solar resource explains **0.05%** of the variance in
  log MWh. "Maximise MWh" is, in practice, "maximise buildable size".

## Grid infrastructure — what works

* OSM `power=line` in the NC bbox: 14,899 segments, 89% voltage-tagged, **11,220 at >= 69 kV**;
  3,142 substations tagged >= 69 kV. Distances computed polygon-edge-to-line in EPSG:32119.
* Eligible candidates: median **0.53 km** to a >= 69 kV line (p90 4.4 km, max 23 km); 31/194 are
  crossed or touched by a line; 57% within 1 km, 92% within 5 km.
* **Yardstick:** operating NC PV plants measured the same way: 1–5 MWac plants median 0.93 km
  (p90 3.6 km); > 20 MWac plants median 0.38 km (p90 1.6 km). Candidates sit in the same range,
  which supports both data quality and the proxy's relevance — real solar farms do cluster near
  mapped lines.
* Line distance and substation distance correlate (Spearman 0.64); line distance has the cleaner
  coverage. Neither says anything about capacity, queue, or cost (and documented as such).
* HIFLD Open is deactivated; not needed.

## Terrain — what works

* USGS 3DEP 1/3″ COGs read by window from S3 for all 268 sites (24 MB), reprojected to EPSG:32119
  at 10 m, Horn slope. Unit-tested on synthetic planes; spot checks are physically plausible
  (Cape Fear plant 1.2° mean slope on the coastal plain; South Wake Landfill 43 m relief at 4.5°;
  Boone mountain quarry 19.9°; Aurora phosphate pit floor at −28 m).
* **Disturbed land is not flat:** median site mean slope 6.4° (brownfields 2.5°, landfills 5.9°,
  quarries 8.8°); a median 43% of each polygon is steeper than 10%. Landfill caps and quarry pit
  walls make slope highly informative — the opposite of the "everything is flat" worry.
* Mean slope is independent of energy (ρ = 0.06) and grid distance (ρ = 0.08); mean and p90 slope
  are redundant (ρ = 0.97), keep one.
* Caveat: DEM acquisition dates predate current landfill/quarry topography.

## Environmental data — what works / doesn't

* **Open water** (OSM): works; removed from usable area (median 0%, p90 7.6% of polygon; flooded
  pits up to 99%).
* **Wetlands:** NWI blocked. OSM wetlands touch only 39 features near candidates (mean overlap 0.1%)
  — clearly incomplete. **Not defensible as a metric yet.**
* **Flood:** FEMA NFHL blocked; no substitute found. `flood_exposure_pct` is NaN (marked unavailable).
* **Existing solar on site:** OSM solar polygons + EIA plant points; only 1 candidate flagged
  (a flooded quarry with an EIA PV plant inside).
* **Roads:** 78% of eligible sites are within 100 m of a drivable public road; median 10 m.
  Road distance does not differentiate disturbed-land sites → context only.

## Usable area

`usable = polygon − water − OSM wetland − pixels steeper than 10 %` on the 10 m grid.
Median usable fraction 0.53 (brownfields 0.94, landfills 0.57, quarries 0.46). 74 of 268 sites
fall below 10 usable acres. Sensitivity: 5% / 15% slope rules leave 162 / 209 eligible.

---

## Pareto results on the real data

194 eligible sites (59 landfills, 22 brownfields, 113 quarries).

| Model (objectives) | Frontier | % | Comment |
|---|---|---|---|
| A: MWh↑, grid line km↓, mean slope↓ | 12 | 6.2% | Mix of 6 landfills, 3 brownfields, 3 quarries; real tradeoffs |
| A′: MWh↑, grid line km↓, slope of usable land↓ | 18 | 9.3% | |
| B: MWh↑, grid line km↓ (slope as constraint) | 5 | 2.6% | **Degenerate:** the 5 largest sites; non-dominated-sort depth 39 |
| B′: MWh↑, substation km↓ | 4 | 2.1% | Same problem |
| C: usable acres↑, grid km↓, water %↓ | 12 | 6.2% | Water % is mostly 0, and larger sites have more water → weak |
| D: MWh↑, grid km↓, road km↓ | 6 | 3.1% | Road adds almost nothing |
| E: MWh↑, grid km↓, MWh/acre↑ | 18 | 9.3% | MWh/acre (CV 2%) just adds near-ties; pulls quarries in |
| F: MWh↑, grid line km↓, substation km↓ | 8 | 4.1% | Two correlated grid proxies |

**What the data shows**

1. **Too few, not too many, nondominated sites.** The worry was a frontier of everything; the
   real problem is the opposite. Usable size spans 10 → 1,923 acres (3 orders of magnitude) and
   31 sites have grid distance ≈ 0, so the biggest site touching a line dominates nearly every
   smaller one. Model B's frontier is "the five biggest sites" — two of which (Aurora Mine,
   3M Pittsboro) are probably operating mines. A planner learns nothing from that.
2. **Size is a scenario, not an objective.** Nobody chooses between a 3 MW brownfield and a 500 MW
   mine on the same axis. Running the same 3 objectives inside project-size bands produces sensible
   frontiers and *independent* objectives (Spearman MWh vs grid distance within bands: −0.15 to 0.13):

   | Band (est. MWac) | n | Frontier (A objectives) |
   |---|---|---|
   | 2.8–10 | 80 | 13 (16%) |
   | 10–40 | 81 | 12 (15%) |
   | 40–150 | 30 | 4 (13%) — Cape Fear plant, South Wake LF, Colon & Brickhaven coal-ash fills |
   | ≥ 150 | 3 | 3 (all) |

   Conservative population (landfills + brownfields + quarries tagged inactive, n = 88):
   model A overall 9 sites (10%); per band 9/40 (23%), 7/36 (19%), 4/11 (36%), 1/1. Small bands
   naturally give proportionally larger frontiers — in the UI, show the band count next to the frontier.
3. **Slope earns its place** (independent, highly variable) and its exclusion threshold matters:
   5% vs 10% changes the model-B frontier (Jaccard 0.57); 10% vs 15% does not (1.00).
4. **Explanations work** in raw units, e.g. *"NC-BR-013 is dominated by NC-LA-035: higher estimated
   annual generation (41,945 vs 12,054 MWh/yr), lower distance to mapped >=69 kV line (0.34 vs 1.18 km),
   lower mean slope (0.5 vs 0.6°)."*

### Knee / "balanced" point

Prototyped (`knee_point`: farthest frontier point from the extreme-point hyperplane). On the model-B
frontier the answer changes with the rescaling: range-normalised → 3M Pittsboro, rank-normalised →
Aurora Mine, log-energy → 3M Pittsboro, with knee scores near zero. With 3–13 points per frontier
and objectives in incommensurable units, a knee is a disguised weighting. **Do not label any site
"best" or "balanced".** Instead show the *tradeoff ladder* (`tradeoff_ladder`): neighbouring
frontier points and the exchange rate in raw units (MWh gained per extra km), and let the user decide.

### Alternatives to Pareto

* Weighted sum / TOPSIS: require weights or normalisation that are exactly the arbitrary
  preferences we want to avoid; TOPSIS also depends on the ideal/anti-ideal normalisation. Reject.
* Lexicographic: hides tradeoffs; reject as default (fine as a sort order).
* **ε-constraint / scenario filtering: adopt alongside Pareto.** The size band, max grid distance,
  max slope threshold, and "include unknown-status quarries" toggles *are* ε-constraints the user
  sets explicitly; Pareto then runs on what remains. This is transparent and cheap (n < 300 →
  instant in the browser).
* Maximum coverage / location-allocation: no demand points or budget here; out of scope.

Recommendation: **Pareto + explicit user-set constraints**, no composite score.

---

## Methodological problems (weak assumptions)

1. Candidate availability: OSM footprint ≠ available land; operating status unknown.
2. Energy is a density assumption (0.35 MWdc/acre) times a ~10%-optimistic yield; effectively acreage.
3. Grid proximity ignores capacity — the true bottleneck for NC interconnection.
4. Usable-area slope threshold (10%) is a product choice; results sensitive at 5%.
5. Wetlands and flood are missing; OSM wetlands must not be presented as wetland screening.
6. Whole-site mean slope partially overlaps the usable-area slope exclusion (steep land already
   reduced MWh); acceptable because it measures site ruggedness (access, grading, stormwater) and is
   empirically independent, but it should be labelled "site ruggedness", not "build cost".
7. DEM date vs current landform for active landfills/quarries.

## Recommended final objectives

Within a user-selected project-size band (default 10–40 MWac est.):

1. **Maximise `estimated_annual_mwh`** — labelled "estimated annual generation (≈ buildable size)".
2. **Minimise `grid_line_distance_km`** — "distance to mapped ≥ 69 kV line (OSM)".
3. **Minimise `mean_slope_deg`** — "site ruggedness (mean slope)"; user can switch it off (→ 2-objective view).

Substation distance is shown, not optimised (correlated with line distance, sparser tagging).

## Recommended constraints

* `usable_area_acres >= 10` (adjustable).
* Usable-area pixel exclusions: slope > 10% (switchable 5/10/15), open water, mapped wetland.
* Exclude sites with existing solar (OSM ≥ 10% overlap or an EIA PV plant inside).
* Scenario filters (user-set ε-constraints): project-size band, max grid distance, candidate types,
  **"include sites with unknown operating status" (default: off for quarries)**.

## Recommended context metrics

`substation_distance_km`, `nearest_line_kv`, `p90_slope_deg`, `water_overlap_pct`, `road_distance_km`,
`candidate_type`, `osm_status_hint`/operator, county, NSRDB capacity factor, the usable-area map
layer, and — once sourced — FEMA SFHA % and NWI wetland % (context only). Informational:
gross acres, elevation range, provenance strings.

## Recommended data pipeline for the app phase

```
offline (once, cached):   download_overture -> preprocess_candidates -> download_elevation ->
                          compute_terrain -> download_solar_resource -> download_eia -> compute_metrics
committed artefact:       data/processed/feasibility_sites.parquet (320 KB, 268 sites, 68 columns)
app build step:           export to GeoJSON/FlatGeobuf (simplified polygons + metrics + provenance)
app runtime:              static files only; Pareto + filters computed client-side (n < 300)
optional refresh:         rerun scripts; nothing in the demo calls a government API
```

---

## Decision

## GO WITH MODIFICATIONS

The real-data pipeline works end-to-end with real, cached, provenance-tracked data, and Pareto
produces small, explainable frontiers. But the evidence changes the product in five ways:

1. **Treat project size as a user-chosen band (ε-constraint), not a global objective.** Across all
   sites, "max MWh" is "max acreage" (R² = 0.9995) and the frontier collapses to the five largest
   sites. Within bands, MWh / grid distance / slope are independent and the frontiers are meaningful.
2. **Make slope do double duty honestly:** pixel slope > 10% removes land from usable area (feeds MWh);
   whole-site mean slope is an optional third objective labelled "ruggedness". Disturbed land is not flat.
3. **Surface operating-status uncertainty.** Default the demo to landfills + brownfields + quarries
   tagged inactive, with a toggle for unknown-status quarries; never present an operating mine as a
   ready site.
4. **No "best"/"balanced" badge.** Knee points were unstable under rescaling; use the tradeoff ladder
   and dominance explanations instead.
5. **Close the data gaps before claiming environmental screening:** load EPA RE-Powering (authority
   and status), USFWS NWI (wetlands) and FEMA NFHL (flood) from an unrestricted network. Until then,
   the UI must show them as "not yet assessed", not as zero.
