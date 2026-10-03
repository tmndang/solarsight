# SolarSight — data feasibility and frozen foundation

Phase 1 (OSM candidates, GO WITH MODIFICATIONS) is archived in `docs/analysis/phase1/`. This
document is the phase-2 state after integrating NC DEQ Brownfields, the full EPA RE-Powering
attribute table and USFWS NWI. Numbers come from `docs/analysis/foundation_report.md`.

## Answers to the audit questions

1. **Does the local EPA download contain the Mapper attributes?** Yes. The GDB layer
   `re_powering_mapper_sites` has every attribute. `DataRecords.csv` is the same table (6,074 NC rows,
   1:1 on Cross-Reference Number, identical values) with labelled units. EPA PV capacity = acres / 6.9
   (AC/DC unstated).
2. **How many DEQ polygons match EPA?** 973 by exact ID (high confidence), 3 by address+city
   (medium), 7 by unique point-in-polygon (low), 3 ambiguous (left unmatched), 377 unmatched (DEQ
   projects newer than EPA's snapshot). Every EPA "NC Brownfield Projects" record matched.
3. **DEQ vs EPA acreage.** EPA acreage *is* the DEQ-reported acreage (equal for 97.3%). Current DEQ
   polygon area: median abs diff 0.10 ac (1.9%); 76.6% within 10%; 92 records differ by >50%
   (mostly boundary amendments and multipart updates, e.g. Organic Production Services 0.39 → 14.9 ac).
4. **Our transmission distance vs EPA.** From the same EPA point: median abs diff 0.20 km,
   Spearman 0.81, 86% within 0.5 km. Production metric (polygon edge) vs EPA: Spearman 0.85.
   Disagreements come from definitions (EPA includes 66 kV and unknown-voltage lines; SolarSight
   requires a ≥ 69 kV tag) and from data vintage.
5. **Is the transmission metric trustworthy?** Yes, as a proximity proxy. It is validated against
   brute force and against EPA, and it is current.
6. **Does NSRDB/PySAM change decisions?** No. MWh per MW AC: CV 2.0% (1,634–1,860), inside the
   model's ~10% bias. Adding it as an objective would let 2% differences grow the 10 MW frontier
   from 2 to 11. It stays validation and context.
7. **Capacity convention.** Project size in **MW AC**; land density and PVWatts in MW DC; DC/AC 1.25.
8. **Acres per MW.** 0.35 MW DC (0.28 MW AC) per *usable* acre, about 3.57 usable acres per MW AC
   (LBNL 2019 whole-plant median). EPA's 6.9 gross acres/MW is shown separately.
9. **Terrain formulation.** D+: slope exclusion (default 10%) for feasibility, then minimise the mean
   slope of the remaining usable land. Of the alternatives:
   * A (whole-site mean slope) double counts.
   * B/C (extreme-only exclusion) do not change the frontier (C has the same frontier as D+) but
     inflate feasibility with land rated unbuildable.
   * D (slope only as a constraint, grid as the only objective) gives a 29-way tie at 0 km.
10. **Does NWI change usable acreage?** It changes few decisions. 113 of 434 DEQ candidates overlap
    NWI wetland (50 > 5%, 27 > 20%, max 88%). Excluding NWI flips feasibility for 4 / 7 / 3 / 2 sites
    at 5 / 10 / 20 / 40 MW. The overlap is shown and the exclusion is switchable.
11. **What was "mapped wetlands"?** OSM `natural=wetland` (Overture `base/land`). It is now
    `osm_mapped_wetland_*`, context only (30 candidates touch it vs 200 for NWI).
12. **Are DEQ Brownfields sufficient as the primary universe?** Yes. 434 polygons ≥ 10 ac, 361 not
    built over, and 162 / 75 / 34 / 16 feasible for 5 / 10 / 20 / 40 MW AC.
13. **Candidates per scenario.** See the funnel below.
14. **Meaningful tradeoffs?** Only a few. The frontier is 2 sites in every size class. Grid distance
    and terrain are uncorrelated (ρ about 0), many sites touch a line (29 of 75 at 10 MW), and two large
    flat sites sit on lines. This is robust: substation distance, three objectives or tolerances give
    2–5. The product answer is to show non-dominated ranks 1–3 (8 sites at 10 MW), because the
    availability of any rank-1 site is unknown. No objective was added to enlarge the frontier.
15. **Still missing.** FEMA flood, DEQ AEC polygons, site availability/ownership, current NWI,
    landfill cell-level status.
16. **Blocking?** No. See the decision.

## Funnel — baseline brownfield scenario (slope ≤ 10%, NWI excluded from usable area)

| Target MW AC | Usable acres needed | Candidates | DEQ record, not built out | Large enough | Screen-eligible | Rank 1 | Rank ≤ 3 |
|---|---|---|---|---|---|---|---|
| 5 | 17.9 | 662 | 361 | 162 | 162 | 2 | 10 |
| 10 | 35.7 | 662 | 361 | 75 | 75 | 2 | 8 |
| 20 | 71.4 | 662 | 361 | 34 | 34 | 2 | 7 |
| 40 | 142.9 | 662 | 361 | 16 | 16 | 2 | 4 |

Slope rule sensitivity (feasible count at 5 / 10 / 15%): 10 MW gives 55 / 75 / 83 and 40 MW gives
7 / 16 / 16. The frontier membership is identical across thresholds (Jaccard 1.0), so the slope rule
changes *who qualifies* but not *who leads*.

Secondary scenarios at 10 MW: landfills (likely_closed or mixed) 6 → 1 feasible; quarries
(likely_closed) 11 → 2. Both are thin and should be labelled exploratory.

## Demo candidates (10 MW AC baseline unless noted) — screening candidates, not recommendations

| Candidate | Source / confidence | Acres gross → usable | Max MW AC | Grid km (EPA km) | Usable slope° | NWI % | Role in demo | Warning |
|---|---|---|---|---|---|---|---|---|
| Singer Site, Chocowinity (DEQ-02005-98-007) | DEQ Recorded / high | 39 → 36 | 10.1 | 0.03 (0.03) | 0.42 | 0 | Rank-1; just big enough for 10 MW (falls out at 20 MW) | 7% built; barely feasible |
| WestPoint Home (former), Wagram (DEQ-18035-14-083) | DEQ No Further Interest / high | 985 → 680 | 190 | 0.00 (0.00) | 0.77 | 29.4 | Rank-1 in every size class; shows the NWI switch | Exited the program; large NWI share |
| Maxton Feed Mill (DEQ-21020-17-078) | DEQ Recorded / high | 344 → 212 | 59 | 1.57 (1.58) | 0.65 | 38.3 | Rank-1 at 20/40 MW: flatter but farther; EPA and SolarSight agree | High NWI overlap |
| Schlage Lock Facility, Rocky Mount (DEQ-08001-04-064) | DEQ Recorded / high | 47 → 41 | 11.6 | 0.00 | 1.07 | 0 | Rank-2, dominated only by WestPoint (equal distance, rougher) | 12% built |
| Carolina Creosoting Corp., Leland (DEQ-08020-04-010) | DEQ Recorded / high | 87 → 58 | 16.3 | 0.06 | 0.76 | 32.0 | Rank-2; explanation demo vs Singer Site | Creosote site, NWI |
| Texfi Industries, Fayetteville (DEQ-13017-09-026) | DEQ Recorded / high | 80 → 73 | 20.4 | 2.88 (EPA 0.00) | 0.97 | 0 | Shows the EPA vs current-definition disagreement (EPA counts a 66 kV line) | grid definition |
| Abbott Laboratories, Laurinburg (DEQ-07027-03-083) | DEQ Recorded / high | 51 → 44 | 12.2 | 3.31 (3.28) | 0.80 | 0 | Flat but far | 15% built |
| ReVenture East, Charlotte (DEQ-15020-11-060) | DEQ Recorded / high | 303 → 181 | 50.5 | 0.00 | 2.96 | 6.2 | Close but rough (rank 26): terrain tradeoff | steep (p90 9.7°) |
| Townsend and Acme-McCrary, Siler City (DEQ-20060-16-019) | DEQ Recorded / high | 79 (EPA 34) → 68 | 19.0 | 0.77 | 2.48 | 0 | Current DEQ polygon is 2.3× the EPA acreage | boundary changed since EPA |

**Not for the main demo**: Dorothea Dix Park, Raleigh (DEQ Active Eligible). It is a 300-acre city
park and shows why a brownfield record does not mean availability. Use it only to illustrate that warning.

## Frozen methodology (what the app implements)

1. **Load** `data/app/candidates.geojson` + `data/app/meta.json`. No network calls.
2. **Scenario inputs**:
   * target MW AC (presets 5/10/20/40, free input allowed);
   * slope rule T ∈ {5, 10, 15}% (default 10);
   * exclude NWI from usable area (default on);
   * scenario: brownfields (default) / landfills / quarries;
   * optional caps: max grid km, max NWI %.
3. **Funnel**: status/type filter → `usable_acres_slope{T}[_nwi_not_excluded] >= target / 0.28` →
   objective values present and caps → Pareto.
4. **Pareto**: minimise `grid_line_distance_km` and `usable_mean_slope_deg_slope{T}`. Strict dominance;
   missing values excluded; non-dominated ranks 1..n; example dominator plus a raw-unit explanation
   sentence. No weights, scores, knee points or "best" label.
5. **Context per site**: EPA panel (`epa_*`, labelled "EPA screening, historical") kept separate from
   the SolarSight panel. Target generation = target MW AC × `annual_mwh_per_mw_ac`. Warnings come from
   `meta.warnings`. FEMA shows "not assessed"; AEC shows "not available".

## Decision

## READY WITH KNOWN GAPS

The core analysis is defensible:
* authoritative current polygons with an exact EPA ID join;
* validated current transmission proximity;
* tested terrain;
* explicit, unit-consistent project sizing;
* correct, tested Pareto with explanations.

Known non-blocking gaps, all represented as unknown or not assessed in the data:
* **Should fix before demo**: FEMA flood (if time).
* **Nice to have**: DEQ AEC polygons, pavement detection.
* **Post-hackathon**: site availability/ownership, landfill cell-level status, current NWI, grid capacity.

One product caveat must stay visible: the frontier is small (2) because the data contain few real
tradeoffs. The UI should present ranks 1–3 and the "dominated because…" explanations, not just the frontier.
