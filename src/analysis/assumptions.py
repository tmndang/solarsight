"""Single source of truth for every modelling assumption (frozen for the app build).

Each entry is meant to be rendered verbatim in the methodology UI. Entries whose basis says
"product choice" are NOT externally mandated; the UI exposes them (or their sensitivity).

Unit convention (frozen): project size is expressed in **MW AC** (what a planner/utility quotes);
land density and PVWatts system size are **MW DC**. Conversion uses dc_ac_ratio.
"""

ASSUMPTIONS = {
    # --- candidate pool -------------------------------------------------------
    "min_gross_acres_pool": 10.0,          # pool filter before metrics are computed
    # --- project sizing (UI scenario) -----------------------------------------
    "target_sizes_mw_ac": [5.0, 10.0, 20.0, 40.0],
    "mw_dc_per_usable_acre": 0.35,         # LBNL 2019 median, fixed-tilt
    "dc_ac_ratio": 1.25,                   # 0.35 MWdc / 0.28 MWac per acre (LBNL 2019 medians)
    # -> 0.28 MW AC per usable acre; acres required = target_mw_ac / 0.28
    # --- usable-area exclusions (pixel level, 10 m grid in EPSG:32119) ----------
    "slope_exclusion_pct": 10.0,           # default: pixels steeper than this are not usable
    "slope_exclusion_options_pct": [5.0, 10.0, 15.0],  # user-selectable scenario values
    "exclude_buildings_from_usable": True,
    "exclude_surface_water_from_usable": True,   # current OSM/Overture water polygons
    "exclude_nwi_wetlands_from_usable": True,    # NWI vegetated wetland classes (screening, not legal)
    # --- PV system (planning level, PVWatts v8) -------------------------------
    "array_type": "fixed open rack",       # PVWatts array_type 0
    "tilt_deg": 20.0,
    "azimuth_deg": 180.0,
    "module_type": "standard",
    "system_losses_pct": 14.0,             # PVWatts v8 default
    "inverter_efficiency_pct": 96.0,       # PVWatts v8 default
    "gcr": 0.4,
    "weather": "NREL NSRDB GOES v4.0.0 TMY-2024, nearest ~4 km pixel",
    "observed_vs_model_ratio": 0.91,       # 1 / median(model/observed) = 1/1.10, NC fixed-tilt fleet (context only)
    # --- grid proxy -----------------------------------------------------------
    "grid_min_kv": 69.0,                   # mapped lines/substations >= 69 kV count as 'transmission'
}

ASSUMPTION_BASIS = {
    "min_gross_acres_pool": "product choice: the smallest offered target (5 MW AC) needs ~17.9 usable "
                            "acres, so polygons under 10 gross acres can never qualify",
    "target_sizes_mw_ac": "UI scenario presets; any value can be passed to the scenario engine",
    "mw_dc_per_usable_acre": "Bolinger & Bolinger (2022), 'Land Requirements for Utility-Scale PV: An Empirical "
                             "Update on Power and Energy Density', IEEE J. Photovoltaics; 2019 median power "
                             "density 0.35 MWdc/acre fixed-tilt (0.28 MWac/acre). Measured over whole plant "
                             "footprints, so it already includes roads, setbacks and inverter pads",
    "dc_ac_ratio": "derived from the same LBNL medians (0.35/0.28); NC EIA-860 median is ~1.3",
    "slope_exclusion_pct": "product choice with disclosed sensitivity. NREL's 2023 reV utility-PV supply "
                           "curves reportedly exclude slopes > 5% (greenfield, ~90 m data); graded disturbed "
                           "land is commonly built steeper, so 10% is the default and 5%/15% are offered",
    "exclude_buildings_from_usable": "ground-mount PV cannot occupy existing structures (rooftop PV out of scope)",
    "exclude_surface_water_from_usable": "ground-mount PV cannot occupy open water (floating PV out of scope)",
    "exclude_nwi_wetlands_from_usable": "screening convention (NREL reV also excludes wetlands): wetland acres are "
                                        "not counted toward project size. NOT a jurisdictional determination",
    "system_losses_pct": "PVWatts v8 default (NREL)",
    "inverter_efficiency_pct": "PVWatts v8 default (NREL)",
    "tilt_deg": "median tilt_angle_deg of NC PV generators in EIA-860 (2024 report year, via PUDL)",
    "array_type": "EIA-860 2024: 587 of 850 NC PV generator records flag fixed-tilt",
    "gcr": "PVWatts default",
    "observed_vs_model_ratio": "validation against 92 NC fixed-tilt plants (EIA-923 2023-24): model/observed "
                               "median 1.10; shown as context, not applied to estimates",
    "grid_min_kv": "product choice: 69 kV is the common sub-transmission floor and the lowest voltage "
                   "the former HIFLD transmission layer covered; distribution lines are poorly mapped in OSM",
}


def mw_ac_per_usable_acre(a: dict = ASSUMPTIONS) -> float:
    return a["mw_dc_per_usable_acre"] / a["dc_ac_ratio"]


def required_usable_acres(target_mw_ac: float, a: dict = ASSUMPTIONS) -> float:
    """Usable acres needed to host `target_mw_ac` of AC capacity."""
    if target_mw_ac <= 0:
        raise ValueError("target_mw_ac must be positive")
    return target_mw_ac / mw_ac_per_usable_acre(a)
