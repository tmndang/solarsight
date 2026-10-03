# SolarSight methodology (feasibility-spike version)

SolarSight is a **screening and planning tool**. It shows candidate sites on previously disturbed
land in North Carolina and the *tradeoffs* among them. It does not estimate interconnection
capacity or cost, does not certify environmental suitability or permitting, and does not
produce engineering-grade yield or an investment ranking. Every number is a planning proxy that
requires site-specific analysis.

## 1. Product question

> Among mapped disturbed-land sites in North Carolina, which ones offer the strongest tradeoffs
> between estimated energy production and proximity to mapped grid infrastructure, after removing
> land that is too steep, under water, or too small to matter?

## 2. Pipeline

```
OSM landfill / brownfield / quarry polygons (Overture)       -> candidates.parquet
  |  clip to NC, de-duplicate overlaps, >= 5 gross acres
USGS 3DEP 1/3" DEM -> EPSG:32119 10 m -> Horn slope         -> terrain.parquet
  |  usable area = polygon pixels - water - mapped wetland - pixels steeper than 10 %
NSRDB TMY (nearest 4 km pixel) -> PVWatts v8 (PySAM)        -> kWh per kWdc
  |  MWdc = usable acres x 0.35 ; MWh = MWdc x kWh/kWdc
OSM power lines / substations >= 69 kV, roads, solar plants -> distances, flags
  |
feasibility_sites.parquet -> hard constraints -> Pareto (src/analysis/pareto.py)
```

All metric geometry work happens in **EPSG:32119 (NAD83 / North Carolina, metres)**.

## 3. Metric categories

| Category | Metric | Why here |
|---|---|---|
| **Hard constraint** | `usable_area_acres >= 10` | Below ~10 usable acres (~2.8 MWac) the site is not a utility-scale screening target. Product choice, adjustable. |
| **Hard constraint** | no existing solar on site (OSM solar polygons >= 10 % of the site, or an EIA-860 PV plant located inside) | Already developed for solar. |
| **Constraint inside usable area** | slope > 10 % (pixel), open water, mapped wetland | Land you could not reasonably build ground-mount PV on is removed *before* energy is estimated, so slope is already priced into MWh. 5 % and 15 % sensitivity reported. |
| **Pareto objective** | `estimated_annual_mwh` (max) | Planning-level energy. Effectively "buildable size", see §6. |
| **Pareto objective** | `grid_line_distance_km` (min) | Distance from the candidate polygon edge to the nearest mapped >= 69 kV line. |
| **Optional 3rd objective / context** | `mean_slope_deg` (min) | Grading effort on the land that remains; see DATA_FEASIBILITY for when to switch it on. |
| **Context** | `substation_distance_km`, `nearest_line_kv`, `p90_slope_deg`, `water_overlap_pct`, `osm_wetland_overlap_pct`, `road_distance_km`, `osm_status_hint`, `candidate_type`, county | Shown to the planner; not optimised. |
| **Unavailable** | `flood_exposure_pct`, `nwi_wetland_overlap_pct` | Sources blocked in this environment. Stored as NaN, never imputed. |
| **Informational** | gross area, elevation range, NSRDB pixel, kWh/kWdc, capacity factor, provenance strings | Explain the numbers. |

## 4. Pareto dominance

For objectives f1..fk with directions, A dominates B iff A is no worse than B on every objective and
strictly better on at least one. The frontier is the set of eligible candidates that no other
eligible candidate dominates.

Implementation (`src/analysis/pareto.py`):

* arbitrary objectives `(metric, maximize|minimize)`; O(n² k) vectorised dominance matrix (fine for thousands of sites);
* filtered (ineligible) rows neither dominate nor are dominated; rows with a missing objective value
  are reported as `missing`, never imputed;
* exact duplicates do not dominate each other;
* returns status, non-dominated-sorting rank, number of dominators, an example dominator (a frontier
  member when possible, else the dominator better on most objectives) and raw-unit differences;
* `explain()` produces sentences like (real output) *"NC-BR-013 is dominated by NC-LA-035: higher
  estimated annual generation (41,945 vs 12,054 MWh/yr), lower distance to mapped >=69 kV line
  (0.34 vs 1.18 km), lower mean slope (0.5 vs 0.6 deg)."*;
* recommended use: run Pareto **inside a user-selected project-size band** and other explicit
  filters (ε-constraints); across all sizes the frontier collapses to the largest sites (see
  DATA_FEASIBILITY.md);
* `tradeoff_ladder()` lists neighbouring frontier points with the exchange rate in raw units
  (MWh gained per extra km) — no normalisation needed.

## 5. Generation method

```
usable_area_acres  (3DEP + OSM water/wetland, slope <= 10 %)
  x 0.35 MWdc/acre (LBNL 2019 median fixed-tilt power density; 0.28 MWac/acre)
  = estimated_capacity_mwdc ; /1.25 = estimated_capacity_mwac
  x PVWatts v8 specific yield (kWh/kWdc/yr), fixed open rack, tilt 20°, azimuth 180°,
    14 % losses, 96 % inverter efficiency, GCR 0.4, NSRDB GOES v4 TMY-2024 nearest pixel
  = estimated_annual_mwh
```

All assumptions live in `src/analysis/assumptions.py` (with a `basis` string for the UI).
Validation: the modelled AC capacity factor across candidates is checked against observed 2024
capacity factors of NC PV plants in EIA-923 (see DATA_FEASIBILITY.md).

Not modelled: horizon/terrain shading, landfill-cap ballast constraints, tracker vs fixed choice,
degradation, curtailment, clipping beyond PVWatts' DC/AC handling, snow, soiling specifics.

## 6. Why energy ≈ acreage (and why we keep it anyway)

Across NC the PVWatts specific yield varies only a few percent, so `estimated_annual_mwh` is
almost exactly proportional to `usable_area_acres`. We keep MWh rather than acres because it is
the unit planners reason in and because it carries the (small) resource signal; but the UI must
say plainly that "more energy" here mostly means "more buildable land".

## 7. Terrain method

1. Read the 3DEP 1/3" COG window around the polygon (+~300 m), EPSG:4269.
2. Reproject to EPSG:32119 at 10 m (bilinear). **Slope is never computed in degrees of lat/lon.**
3. Horn (1981) 3×3 gradient (same as `gdaldem slope`), percent and degrees.
4. Rasterise the polygon on that grid (pixel-centre rule); nodata pixels are dropped (none occurred).
5. `mean_slope_deg`, `median_slope_deg`, `p90_slope_deg` over all polygon pixels; `usable_mean_slope_deg`
   over pixels kept in usable area; share of pixels above 5/10/15 %.

Tested on synthetic planes (`tests/test_terrain_metrics.py`) and spot-checked on known sites.

## 8. Infrastructure-distance method

* Lines: OSM `power=line` whose max `voltage` tag >= 69 kV (11,220 segments in the NC bbox).
  Untagged lines (11 %) are excluded rather than guessed.
* Substations: OSM `power=substation` with max voltage >= 69 kV.
* Distance: planar polygon-edge-to-geometry distance in EPSG:32119; 0 when the line crosses the site.
* Yardstick: the same computation for operating NC PV plants from EIA-860.

This is a **proximity proxy**. It says nothing about available capacity, queue position, or cost.

## 9. Environmental method

* Open water (OSM/Overture `base/water` polygons) is removed from usable area.
* OSM `natural=wetland` polygons are removed from usable area where present, and their overlap is
  reported, but OSM wetland coverage is very incomplete — **NWI is required** before showing a
  wetland metric to users.
* Flood exposure: not computed (FEMA unavailable here). When added, report `% of polygon in FEMA SFHA`
  as context; a mapped SFHA is a regulatory 1%-annual-chance zone, not a forecast probability.

## 10. Known limitations

* Candidate list = OSM mapping of disturbed land; not an authoritative brownfield/contamination
  register; operating status mostly unknown (many quarries/landfills are active).
* No legal parcel boundaries, ownership, zoning or deed restrictions.
* DEM survey dates differ from current landfill/quarry topography.
* Grid distance ignores capacity; NC distribution-level interconnection (common for ~5 MW projects) is invisible.
* Energy is a typical-year, fixed-tilt, planning-level estimate.
