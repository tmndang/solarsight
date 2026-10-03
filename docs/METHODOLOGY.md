# SolarSight methodology (frozen for the application build)

SolarSight is a **screening and decision-support tool**. It helps planners compare disturbed or
underused land for a solar project of a stated size. It eliminates candidates that fail explicit
requirements and shows the remaining tradeoffs. It does not use a weighted suitability score.

It is not a permitting, engineering, interconnection, wetland-jurisdiction or financial tool. It
also does not claim that any site is available for development. EPA RE-Powering already provides a
national first-pass screen; SolarSight adds a transparent decision layer on top of it.

> **Decision question.** For a solar project of a specified scale, which screened North Carolina
> brownfield sites deserve further investigation, and what tradeoffs exist among them?

## 1. Pipeline

```
NC DEQ Brownfields polygons ─┐                                   (scripts/ingest_authoritative.py)
EPA RE-Powering (GDB + CSV) ─┼─ match & reconcile ─ candidates     (scripts/preprocess_candidates.py)
OSM landfill/quarry polygons ┘        │  status + confidence
Overture buildings ───────────────────┘
USGS 3DEP ─ slope ─┐
NWI, OSM water ────┼─ usable area, terrain, overlaps               (scripts/compute_terrain.py)
OSM power lines ───── transmission distance ┐
NSRDB + PVWatts ───── MWh per MW AC         ├─ feasibility_sites.parquet  (scripts/compute_metrics.py)
                                            ┘
scenario (target MW AC, slope rule, NWI switch, statuses) -> funnel -> Pareto  (src/analysis/scenario.py)
data/app/candidates.geojson + meta.json                            (scripts/export_app_data.py)
```

All geometric work happens in **EPSG:32119** (NAD83 / North Carolina, metres).

## 2. Candidate universe and source hierarchy

| Scenario | Candidates | Geometry | Status semantics |
|---|---|---|---|
| **Brownfields (baseline)** | NC DEQ Brownfields Program projects >= 10 gross acres | DEQ polygon (authoritative, current) | DEQ record; DEQ `Status` shown verbatim |
| Landfills (secondary) | OSM `landuse=landfill` polygons with EPA landfill-permit evidence | OSM polygon | `likely_closed` / `mixed` from EPA NC landfill lists |
| Quarries (exploratory, future reclamation) | OSM `landuse=quarry` with abandoned/disused tags | OSM polygon | `likely_closed` only |

Scenarios are never mixed silently. Availability semantics differ by site type.

Rules:
* A DEQ polygon is the identity and geometry of a brownfield. EPA values are attached by match and
  never overwrite DEQ geometry or acreage.
* An OSM polygon that is >= 50% covered by DEQ polygons is dropped as a duplicate of the DEQ record.
* Pool filter: >= 10 gross acres. The smallest preset (5 MW AC) needs 17.9 usable acres, so smaller
  polygons can never qualify.
* IDs are stable: `DEQ-<BF_Number>` and `OSM-<osm element id>`.

## 3. DEQ ↔ EPA RE-Powering matching (`src/analysis/matching.py`)

Matching is deterministic, uses no fuzzy similarity, and takes the first rule that yields exactly one counterpart:

1. **ID**: DEQ `BF_Number` = EPA `Site ID` (program *NC Brownfield Projects*). Confidence `high`.
2. Exact normalised name + street address. Confidence `medium`.
3. Exact normalised name + city. Confidence `medium`.
4. Exact normalised address + city. Confidence `medium`.
5. A unique EPA brownfield point inside the DEQ polygon. Confidence `low` (proximity only).

When a rule finds several counterparts, the record becomes `ambiguous_<rule>` with no match chosen.
Unmatched records keep null EPA fields, never zeros.

## 4. Candidate status and confidence (`src/analysis/status.py`)

`candidate_status` is one of `deq_brownfield_record`, `likely_closed`, `mixed`, `status_unknown`,
`likely_active`, `likely_built_out` (>= 25% of the polygon is under building footprints), or
`existing_solar`. Each status carries `status_source` and `status_reason`.

`screening_confidence`:
* `high` — DEQ polygon whose ID is also in EPA.
* `medium` — DEQ polygon without an EPA match, or a landfill with EPA permit evidence.
* `low` — OSM-only evidence.

No status ever means "available".

## 5. Usable area and capacity — units are frozen

```
buildable base = polygon − building footprints − current surface water (OSM) − NWI wetland*
usable acres   = buildable-base pixels (10 m) with slope <= T,   T ∈ {5, 10, 15} %, default 10 %
                                                * NWI exclusion is switchable (default ON)
max capacity   = usable acres × 0.35 MW DC/acre   (LBNL 2019 median fixed-tilt power density)
               = usable acres × 0.28 MW AC/acre   (DC/AC 1.25)
```

* Project size is expressed in **MW AC**. Land density and PVWatts are DC-referenced. Every field
  carries `_mw_ac` or `_mw_dc`.
* Required usable acres = target MW AC / 0.28: **5 MW → 17.9 ac, 10 → 35.7, 20 → 71.4, 40 → 142.9**.
* A site is `size_feasible` iff usable acres >= required. Missing usable area means infeasible, never
  feasible. There is no "uncertain" band in the frozen version.
* The density is a whole-plant figure, so it already includes roads and setbacks; usable area does
  not subtract them again.
* EPA's `epa_estimated_pv_capacity_mw` = EPA acreage / 6.9 (gross acres, AC/DC not stated, no
  exclusions). It is shown as an EPA screening value only.

## 6. Generation — context, not an objective

PVWatts v8 (PySAM 7.1.1) runs on the nearest NSRDB GOES v4.0.0 TMY-2024 pixel with fixed tilt 20°
(EIA-860 NC median), 14% losses and 96% inverter efficiency. It produces
`annual_mwh_per_mw_ac = kWh/kWdc × 1.25`. For a target project,
**MWh/yr = target MW AC × annual_mwh_per_mw_ac**.

Across all DEQ candidates the coefficient of variation of this value is about 2%. Validation against
92 NC fixed-tilt plants shows the model runs about 10% above observed output. Generation is therefore
displayed, not optimised. With a fixed target size it cannot reward acreage. As a third Pareto
objective it would let differences of about 2% (inside model error) decide dominance.

## 7. Terrain (frozen formulation "D+")

* 3DEP 1/3″ DEM is reprojected to EPSG:32119 at 10 m (bilinear), then slope is computed with the
  Horn 3×3 method in percent and converted to degrees. Slope is never computed in lat/lon degrees.
* **Constraint**: pixels steeper than T are not usable (this feeds project-size feasibility).
* **Objective**: `usable_mean_slope_deg_slope{T}`, the mean slope of the land that remains usable.
  This avoids double counting. The exclusion defines *where* you would build; the objective measures
  *how much grading* that land needs. Minimising whole-site mean slope (formulation A) would penalise
  steep corners that are never used.
* Context: whole-site mean, median and p90 slope; share of the polygon steeper than 5/10/15%.
* T is a **user-selectable scenario parameter (5/10/15%, default 10%)**, with sensitivity disclosed.

## 8. Transmission proximity (current, SolarSight)

> `grid_line_distance_km` = minimum planar distance in EPSG:32119 from the current candidate
> polygon (edge; 0 if the line crosses the site) to the nearest OpenStreetMap `power=line` whose
> maximum `voltage` tag is >= 69 kV (Overture `base/infrastructure`, release 2026-09-23.1).

Lines without a voltage tag (11%) are excluded rather than guessed. The value was checked against
an independent brute-force computation (identical) and against EPA's historical distance from the
same EPA point (Spearman 0.81, 86% within 0.5 km).

It is a **proximity screening proxy only**. It says nothing about capacity, queue, cost or
feasibility. Substation distance is context only: it is less well validated (Spearman 0.74) and
correlated with line distance (ρ about 0.72).

EPA's own distances (`epa_transmission_distance_miles` etc.) are shown in miles, labelled as EPA
historical screening.

## 9. Environment

* **NWI**: `nwi_wetland_overlap_acres/pct` covers vegetated wetland classes only; `nwi_water_overlap_pct`
  is shown as context. Wording: "x% of the mapped project boundary overlaps NWI wetland features
  (1980s imagery; not a jurisdictional determination)." By default NWI wetland is removed from
  usable acres; the switch keeps both values (`usable_acres_slope{T}` and `…_nwi_not_excluded`).
  An optional user cap (max NWI %) fails sites with missing NWI rather than treating missing as 0.
* **OSM wetlands** (phase 1's "mapped wetland") are now `osm_mapped_wetland_*`, context only, and
  no longer used in usable area.
* **FEMA**: `fema_flood_data_status = "not_assessed"`; overlap fields are null.
* **AEC**: not in the repository. `aec_data_status = "not_available"`. When added, AECs are context
  geometry only: no severity score, and no automatic removal from usable area.

## 10. Pareto analysis (`src/analysis/pareto.py`, `src/analysis/scenario.py`)

```
candidates → status/site-type filter → size feasibility (target MW AC, slope rule, NWI switch)
           → screen filter (objective values present; optional user caps) → Pareto
objectives: minimise grid_line_distance_km, minimise usable_mean_slope_deg_slope{T}
```

* A dominates B iff A is no worse on every objective and strictly better on at least one. Missing
  values are excluded, never imputed. Filtered rows neither dominate nor are dominated. Duplicates do
  not dominate each other.
* Output per site: status, **non-dominated-sorting rank** (1 = frontier; 2 = frontier after removing
  rank 1, …), example dominator (preferring a frontier member), raw-unit differences, and an
  `explain()` sentence.
* The app shows rank 1 as the frontier and ranks 2–3 as "next frontier if a better site is
  unavailable". This is parameter-free and matters because no brownfield's availability is known.
* An optional practical-significance tolerance (raw units) exists in the engine. It was evaluated
  and is **off by default**.
* No knee point, "best" label, weights or normalisation.

## 11. Limitations and claims never made

Grid capacity, queue position and connection cost; permitting; legal wetland jurisdiction; flood
risk (not assessed); contamination severity; site availability or ownership; engineering-grade
yield. DEM, NWI and EPA vintages differ from today's conditions. Building footprints miss pavement,
so parking lots count as usable land.
