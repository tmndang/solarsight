# Pareto analysis on real NC candidates (auto-generated)

Candidates: 268; eligible after hard constraints: 194 (usable area < 10 ac: 74, existing solar on site: 1).

Eligible by type: {"quarry": 113, "landfill": 59, "brownfield": 22}

## Distributions (eligible)

| metric | min | 10% | 50% | 90% | max | mean | std | cv |
|---|---|---|---|---|---|---|---|---|
| gross_area_acres | 10.58 | 21.07 | 103.94 | 349.28 | 2193.20 | 165.56 | 247.62 | 1.50 |
| usable_area_acres | 10.08 | 14.35 | 45.48 | 185.36 | 1923.12 | 97.38 | 204.78 | 2.10 |
| usable_fraction | 0.10 | 0.29 | 0.53 | 0.94 | 1.00 | 0.58 | 0.23 | 0.40 |
| estimated_capacity_mwac | 2.82 | 4.02 | 12.73 | 51.90 | 538.47 | 27.27 | 57.34 | 2.10 |
| estimated_annual_mwh | 4739.24 | 7105.22 | 22882.58 | 93812.16 | 957911.47 | 48412.10 | 101234.43 | 2.09 |
| kwh_per_kwdc | 1290.13 | 1382.74 | 1420.82 | 1455.15 | 1503.49 | 1420.02 | 31.46 | 0.02 |
| mwh_per_usable_acre | 451.55 | 483.96 | 497.29 | 509.30 | 526.22 | 497.01 | 11.01 | 0.02 |
| grid_line_distance_km | 0.00 | 0.00 | 0.53 | 4.37 | 23.11 | 1.70 | 2.97 | 1.75 |
| substation_distance_km | 0.00 | 0.28 | 2.13 | 5.94 | 23.50 | 2.94 | 3.11 | 1.06 |
| road_distance_km | 0.00 | 0.00 | 0.01 | 0.32 | 1.63 | 0.09 | 0.18 | 2.05 |
| mean_slope_deg | 0.52 | 1.85 | 6.41 | 13.60 | 24.74 | 7.43 | 4.85 | 0.65 |
| p90_slope_deg | 1.21 | 4.37 | 14.25 | 34.37 | 55.88 | 17.26 | 12.07 | 0.70 |
| usable_mean_slope_deg | 0.46 | 1.44 | 2.53 | 3.19 | 3.92 | 2.43 | 0.69 | 0.28 |
| water_overlap_pct | 0.00 | 0.00 | 0.00 | 7.62 | 55.05 | 2.80 | 7.99 | 2.86 |
| osm_wetland_overlap_pct | 0.00 | 0.00 | 0.00 | 0.00 | 11.58 | 0.10 | 0.87 | 9.03 |

## Is annual MWh just acreage?

- Pearson r(log MWh, log usable acres) = 0.9998 (R^2 = 0.9995)
- Specific yield kWh/kWdc: min 1290, max 1503, CV 2.215%
- Share of variance of log(MWh) explained by site solar resource: 0.048%

## Spearman correlations (eligible)

|  | estimated_annual_mwh | usable_area_acres | kwh_per_kwdc | grid_line_distance_km | substation_distance_km | road_distance_km | mean_slope_deg | p90_slope_deg | water_overlap_pct |
|---|---|---|---|---|---|---|---|---|---|
| estimated_annual_mwh | 1.00 | 1.00 | 0.14 | -0.28 | -0.19 | -0.28 | 0.06 | 0.12 | 0.28 |
| usable_area_acres | 1.00 | 1.00 | 0.12 | -0.27 | -0.19 | -0.28 | 0.07 | 0.13 | 0.28 |
| kwh_per_kwdc | 0.14 | 0.12 | 1.00 | -0.13 | 0.01 | 0.03 | -0.09 | -0.04 | 0.04 |
| grid_line_distance_km | -0.28 | -0.27 | -0.13 | 1.00 | 0.64 | 0.11 | 0.08 | 0.09 | -0.04 |
| substation_distance_km | -0.19 | -0.19 | 0.01 | 0.64 | 1.00 | 0.16 | 0.07 | 0.07 | -0.02 |
| road_distance_km | -0.28 | -0.28 | 0.03 | 0.11 | 0.16 | 1.00 | -0.07 | -0.04 | -0.14 |
| mean_slope_deg | 0.06 | 0.07 | -0.09 | 0.08 | 0.07 | -0.07 | 1.00 | 0.97 | 0.11 |
| p90_slope_deg | 0.12 | 0.13 | -0.04 | 0.09 | 0.07 | -0.04 | 0.97 | 1.00 | 0.17 |
| water_overlap_pct | 0.28 | 0.28 | 0.04 | -0.04 | -0.02 | -0.14 | 0.11 | 0.17 | 1.00 |

## Objective-set comparison

| model | n_eligible | frontier | frontier_pct | frontier_types | max_rank |
|---|---|---|---|---|---|
| A: MWh / grid line / mean slope | 194 | 12 | 6.2 | {"landfill": 6, "brownfield": 3, "quarry": 3} | 13 |
| B: MWh / grid line (slope as constraint) | 194 | 5 | 2.6 | {"landfill": 3, "quarry": 2} | 39 |
| B': MWh / substation (slope as constraint) | 194 | 4 | 2.1 | {"landfill": 3, "quarry": 1} | 27 |
| C: usable acres / grid line / water overlap | 194 | 12 | 6.2 | {"landfill": 6, "quarry": 5, "brownfield": 1} | 26 |
| D: MWh / grid line / road | 194 | 6 | 3.1 | {"landfill": 3, "quarry": 3} | 18 |
| E: MWh / grid line / MWh-per-acre | 194 | 18 | 9.3 | {"quarry": 13, "landfill": 5} | 14 |
| F: MWh / grid line / substation | 194 | 8 | 4.1 | {"landfill": 5, "quarry": 3} | 17 |
| A': MWh / grid line / slope of usable land | 194 | 18 | 9.3 | {"landfill": 8, "quarry": 7, "brownfield": 3} | 10 |

## Size-band scenarios (objectives: MWh max, grid line km min, mean slope min)

| band_mwac | population | n | frontier | frontier_pct | spearman_mwh_vs_grid | frontier_sites |
|---|---|---|---|---|---|---|
| 2.8-10 | all eligible | 80 | 13 | 16.25 | 0.02 | NC-BR-011, NC-BR-013, NC-BR-015, NC-BR-016, NC-BR-020, NC-LA-028, NC-LA-041, NC-QU-074, NC-QU-091, NC-QU-103, NC-QU-106, NC-QU-109, NC-QU-112 |
| 2.8-10 | conservative | 40 | 9 | 22.50 | 0.05 | NC-BR-011, NC-BR-013, NC-BR-015, NC-BR-016, NC-BR-020, NC-LA-028, NC-LA-041, NC-LA-044, NC-LA-052 |
| 10-40 | all eligible | 81 | 12 | 14.81 | -0.09 | NC-BR-003, NC-BR-006, NC-LA-011, NC-LA-018, NC-LA-024, NC-LA-026, NC-LA-035, NC-QU-017, NC-QU-021, NC-QU-032, NC-QU-038, NC-QU-072 |
| 10-40 | conservative | 36 | 7 | 19.44 | -0.15 | NC-BR-003, NC-BR-006, NC-LA-011, NC-LA-018, NC-LA-024, NC-LA-026, NC-LA-035 |
| 40-150 | all eligible | 30 | 4 | 13.33 | 0.13 | NC-BR-001, NC-LA-002, NC-LA-005, NC-LA-006 |
| 40-150 | conservative | 11 | 4 | 36.36 | 0.00 | NC-BR-001, NC-LA-002, NC-LA-005, NC-LA-006 |
| >=150 | all eligible | 3 | 3 | 100.00 | 1.00 | NC-LA-001, NC-QU-001, NC-QU-002 |
| >=150 | conservative | 1 | 1 | 100.00 | nan | NC-LA-001 |

## Conservative population (landfills + brownfields + quarries tagged inactive)

| model | n_eligible | frontier | frontier_pct |
|---|---|---|---|
| A: MWh / grid line / mean slope | 88 | 9 | 10.2 |
| B: MWh / grid line (slope as constraint) | 88 | 3 | 3.4 |
| B': MWh / substation (slope as constraint) | 88 | 3 | 3.4 |
| C: usable acres / grid line / water overlap | 88 | 7 | 8.0 |
| D: MWh / grid line / road | 88 | 4 | 4.5 |
| E: MWh / grid line / MWh-per-acre | 88 | 9 | 10.2 |
| F: MWh / grid line / substation | 88 | 5 | 5.7 |
| A': MWh / grid line / slope of usable land | 88 | 11 | 12.5 |

## Slope-threshold sensitivity (model B)

| slope_threshold_pct | eligible | frontier | jaccard_vs_10pct |
|---|---|---|---|
| 5.00 | 162.00 | 6.00 | 0.57 |
| 10.00 | 194.00 | 5.00 | 1.00 |
| 15.00 | 209.00 | 5.00 | 1.00 |

## Yardstick: operating NC PV plants (EIA-860) to the same mapped grid layers

| plant size | grid_line_distance_km p50 | grid_line_distance_km p90 | substation_distance_km p50 | substation_distance_km p90 |
|---|---|---|---|---|
| 1-5 MWac | 0.93 | 3.58 | 2.06 | 5.69 |
| 5-20 MWac | 1.03 | 3.38 | 1.98 | 6.91 |
| >20 MWac | 0.38 | 1.64 | 0.86 | 4.00 |

Eligible candidates: line p50/p90 = 0.53/4.37 km; substation p50/p90 = 2.13/5.94 km


## Model B frontier (sorted by energy) with tradeoff ladder and knee scores

| site_id | name | candidate_type | county | usable_area_acres | estimated_capacity_mwac | estimated_annual_mwh | grid_line_distance_km | substation_distance_km | mean_slope_deg | knee_range | knee_rank | knee_logrange | mwh_gained_per_extra_km |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NC-QU-001 | Aurora Mine | quarry | Beaufort | 1,923.12 | 538.47 | 957,911.47 | 1.88 | 1.93 | 2.58 | 0.00 | 0.00 | 0.00 | nan |
| NC-QU-002 | 3M Pittsboro | quarry | Chatham | 1,838.37 | 514.74 | 900,625.04 | 1.06 | 2.27 | 3.60 | 0.26 | 0.00 | 0.28 | 69,213.14 |
| NC-LA-001 | WH U 0015 | landfill | Brunswick | 718.26 | 201.11 | 352,916.26 | 0.70 | 1.02 | 2.76 | -0.10 | -0.00 | 0.04 | 1,518,785.61 |
| NC-LA-002 | South Wake Landfill | landfill | Wake | 495.52 | 138.75 | 244,710.20 | 0.08 | 0.23 | 4.45 | 0.04 | 0.00 | 0.12 | 175,034.14 |
| NC-LA-005 | Colon Mine Structural Fill | landfill | Lee | 344.44 | 96.44 | 169,369.21 | 0.00 | 2.03 | 3.79 | 0.00 | -0.00 | 0.00 | 961,527.40 |

Knee by rescaling: {"knee_range": "NC-QU-002", "knee_rank": "NC-QU-001", "knee_logrange": "NC-QU-002"}


## Model A frontier

| site_id | name | candidate_type | usable_area_acres | estimated_annual_mwh | grid_line_distance_km | mean_slope_deg |
|---|---|---|---|---|---|---|
| NC-QU-001 | Aurora Mine | quarry | 1,923.12 | 957,911.47 | 1.88 | 2.58 |
| NC-QU-002 | 3M Pittsboro | quarry | 1,838.37 | 900,625.04 | 1.06 | 3.60 |
| NC-LA-001 | WH U 0015 | landfill | 718.26 | 352,916.26 | 0.70 | 2.76 |
| NC-LA-002 | South Wake Landfill | landfill | 495.52 | 244,710.20 | 0.08 | 4.45 |
| NC-LA-005 | Colon Mine Structural Fill | landfill | 344.44 | 169,369.21 | 0.00 | 3.79 |
| NC-BR-001 | Cape Fear Plant | brownfield | 339.23 | 165,830.88 | 0.14 | 1.18 |
| NC-LA-006 | Brickhaven Mine Structural Fill | landfill | 302.83 | 147,671.75 | 0.00 | 3.53 |
| NC-QU-038 | Riverside Sand Co. | quarry | 129.66 | 65,204.62 | 1.21 | 1.11 |
| NC-LA-026 | Retired 1982 Coal Ash Basin | landfill | 117.99 | 59,803.36 | 0.04 | 1.40 |
| NC-LA-035 | Retired Ash Basin No. 3 | landfill | 82.68 | 41,945.19 | 0.34 | 0.52 |
| NC-BR-006 | Unnamed brownfield (Chatham Co.) | brownfield | 52.56 | 25,990.85 | 0.00 | 0.99 |
| NC-BR-003 | Unnamed brownfield (Perquimans Co.) | brownfield | 39.12 | 19,452.24 | 0.02 | 0.62 |

## Example dominance explanations (model A)

- NC-BR-011 is dominated by NC-BR-006: higher estimated annual generation (MWh/yr) (25,991 vs 13,443), equal distance to mapped >=69 kV line (km) (0.00), lower mean slope (deg) (1.0 vs 1.8).
- NC-BR-008 is dominated by NC-BR-006: higher estimated annual generation (MWh/yr) (25,991 vs 20,411), lower distance to mapped >=69 kV line (km) (0.00 vs 0.06), lower mean slope (deg) (1.0 vs 1.4).
- NC-BR-013 is dominated by NC-LA-035: higher estimated annual generation (MWh/yr) (41,945 vs 12,054), lower distance to mapped >=69 kV line (km) (0.34 vs 1.18), lower mean slope (deg) (0.5 vs 0.6).
- NC-LA-024 is dominated by NC-LA-006: higher estimated annual generation (MWh/yr) (147,672 vs 56,380), equal distance to mapped >=69 kV line (km) (0.00), lower mean slope (deg) (3.5 vs 3.7).
- NC-QU-112 is dominated by NC-BR-006: higher estimated annual generation (MWh/yr) (25,991 vs 14,122), equal distance to mapped >=69 kV line (km) (0.00), lower mean slope (deg) (1.0 vs 1.9).

## PVWatts vs observed EIA-923 capacity factor (NC fixed-tilt PV, 2023-24 mean)

Plants matched to a cached NSRDB pixel: 92. Observed AC CF median 0.200; modelled median 0.220; modelled/observed ratio median 1.102 (p10 1.010, p90 1.246). Pearson r across plants 0.57.
Candidate modelled AC CF (default assumptions): median 0.203, range 0.184-0.215.

