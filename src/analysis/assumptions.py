"""Single source of truth for every modelling assumption.

Each entry is meant to be rendered verbatim in the methodology UI. Values marked
`basis="product choice"` are NOT externally mandated; they are screening choices
that the UI should expose as adjustable.
"""

ASSUMPTIONS = {
    # --- candidate pool -------------------------------------------------------
    "min_gross_acres_pool": 5.0,           # pool filter before metrics are computed
    # --- hard constraints -----------------------------------------------------
    "min_usable_acres": 10.0,              # ~2.8 MWac at the density below
    # --- usable-area exclusions (pixel level, 1/3 arc-second DEM grid) ---------
    "slope_exclusion_pct": 10.0,           # pixels steeper than this are not counted as usable
    "slope_exclusion_sensitivity_pct": [5.0, 10.0, 15.0],
    # --- PV system (planning level) -------------------------------------------
    "mwdc_per_usable_acre": 0.35,          # LBNL 2019 median, fixed-tilt
    "dc_ac_ratio": 1.25,                   # 0.35 MWdc / 0.28 MWac per acre (LBNL 2019 medians)
    "array_type": "fixed open rack",       # PVWatts array_type 0
    "tilt_deg": 20.0,
    "azimuth_deg": 180.0,
    "module_type": "standard",
    "system_losses_pct": 14.0,             # PVWatts v8 default
    "inverter_efficiency_pct": 96.0,       # PVWatts v8 default
    "gcr": 0.4,
    "weather": "NREL NSRDB GOES v4.0.0 TMY-2024, nearest ~4 km pixel",
    # --- grid proxy -----------------------------------------------------------
    "grid_min_kv": 69.0,                   # mapped lines/substations >= 69 kV count as 'grid'
}

ASSUMPTION_BASIS = {
    "min_gross_acres_pool": "product choice (keeps tiny OSM slivers out of the pool)",
    "min_usable_acres": "product choice: below ~10 acres a site is rooftop/community scale, "
                        "not the utility-scale screening this tool targets",
    "slope_exclusion_pct": "product choice. NREL's 2023 reV utility-PV supply curves reportedly exclude "
                           "slopes > 5% (greenfield, ~90 m data); ground-mount PV on graded disturbed land "
                           "is commonly built on steeper ground, so 10% is the default and 5%/15% are "
                           "reported as sensitivity cases",
    "mwdc_per_usable_acre": "Bolinger & Bolinger (2022), 'Land Requirements for Utility-Scale PV: An Empirical "
                            "Update on Power and Energy Density', IEEE J. Photovoltaics; 2019 median power "
                            "density 0.35 MWdc/acre fixed-tilt (0.28 MWac/acre)",
    "dc_ac_ratio": "derived from the same LBNL medians (0.35/0.28)",
    "system_losses_pct": "PVWatts v8 default (NREL)",
    "inverter_efficiency_pct": "PVWatts v8 default (NREL)",
    "tilt_deg": "median tilt_angle_deg of NC PV generators in EIA-860 (2024 report year, via PUDL); "
                "most NC PV generators report fixed-tilt",
    "array_type": "EIA-860 2024: 587 of 850 NC PV generator records flag fixed-tilt",
    "gcr": "PVWatts default",
    "grid_min_kv": "product choice: 69 kV is the lowest voltage the former HIFLD transmission layer "
                   "covered and the common sub-transmission floor; lower-voltage distribution is "
                   "poorly mapped in OSM",
}
