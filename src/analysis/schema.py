"""App-facing field dictionary: group, provenance class, unit, label for every exported field.

provenance classes (the UI must render them differently):
  source           value copied from an authoritative current source (NC DEQ, OSM geometry)
  epa_historical   EPA RE-Powering screening value at EPA's vintage -> "EPA screening"
  derived          computed by SolarSight from data (terrain, NWI, distance, area) -> "SolarSight analysis"
  approximated     derived + a documented modelling assumption (capacity, generation)
  classification   rule-based label (status/confidence) with a reason string
  status           data-availability flag ("not_assessed", "not_available", ...)
"""

FIELDS = {
    # identity
    "site_id": ("identity", "derived", None, "Candidate ID (DEQ-<BF_Number> or OSM-<osm id>)"),
    "name": ("identity", "source", None, "Name"),
    "site_type": ("identity", "source", None, "Site type"),
    "primary_source": ("identity", "source", None, "Candidate source program"),
    "source_id": ("identity", "source", None, "Source record ID"),
    "county": ("identity", "derived", None, "County"),
    "city": ("identity", "source", None, "City (DEQ)"),
    "address": ("identity", "source", None, "Address (DEQ)"),
    "latitude": ("identity", "derived", "deg", "Representative point latitude"),
    "longitude": ("identity", "derived", "deg", "Representative point longitude"),
    "gross_area_acres": ("land", "derived", "acres", "Current polygon area"),
    # DEQ
    "deq_status": ("deq", "source", None, "DEQ Status (verbatim, not interpreted)"),
    "deq_status_date": ("deq", "source", None, "DEQ Status date"),
    "deq_reported_acres": ("deq", "source", "acres", "DEQ-reported acreage"),
    "deq_allowed_use": ("deq", "source", None, "DEQ allowed-use code"),
    "deq_restricted_media": ("deq", "source", None, "DEQ restricted-media code"),
    "deq_docs_link": ("deq", "source", None, "DEQ documents link"),
    # status
    "candidate_status": ("status", "classification", None, "Candidate status"),
    "screening_confidence": ("status", "classification", None, "Screening confidence"),
    "status_reason": ("status", "classification", None, "Why this status"),
    "building_coverage_pct": ("status", "derived", "%", "Share of polygon covered by building footprints"),
    # EPA
    "epa_match_method": ("epa", "derived", None, "EPA match method"),
    "epa_match_confidence": ("epa", "derived", None, "EPA match confidence"),
    "epa_cross_reference_number": ("epa", "epa_historical", None, "EPA Cross-Reference Number"),
    "epa_site_id": ("epa", "epa_historical", None, "EPA Site ID"),
    "epa_program": ("epa", "epa_historical", None, "EPA program"),
    "epa_screening_acres": ("epa", "epa_historical", "acres", "EPA screening acreage"),
    "epa_estimated_pv_capacity_mw": ("epa", "epa_historical", "MW (AC/DC unspecified)", "EPA estimated PV capacity (acres / 6.9)"),
    "epa_max_annual_ghi_kwh_m2_day": ("epa", "epa_historical", "kWh/m2/day", "EPA maximum annual GHI"),
    "epa_utility_scale_pv": ("epa", "epa_historical", None, "EPA utility-scale PV flag (EPA est. >= 5 MW)"),
    "epa_transmission_distance_miles": ("epa", "epa_historical", "miles", "EPA distance to transmission line (from EPA point)"),
    "epa_transmission_kv": ("epa", "epa_historical", "kV", "EPA nearest transmission line voltage"),
    "epa_transmission_status": ("epa", "epa_historical", None, "EPA nearest transmission line status"),
    "epa_substation_distance_miles": ("epa", "epa_historical", "miles", "EPA distance to substation"),
    "epa_substation_voltage_kv": ("epa", "epa_historical", "kV", "EPA substation voltage (Mapper header says Volts; values are kV)"),
    "epa_road_distance_miles": ("epa", "epa_historical", "miles", "EPA distance to road"),
    "epa_screening_vintage": ("epa", "epa_historical", None, "EPA screening vintage"),
    # terrain
    "mean_slope_deg": ("terrain", "derived", "deg", "Mean slope, whole polygon"),
    "p90_slope_deg": ("terrain", "derived", "deg", "90th-percentile slope, whole polygon"),
    "steep_gt5pct_share": ("terrain", "derived", "fraction", "Share of polygon steeper than 5%"),
    "steep_gt10pct_share": ("terrain", "derived", "fraction", "Share of polygon steeper than 10%"),
    "steep_gt15pct_share": ("terrain", "derived", "fraction", "Share of polygon steeper than 15%"),
    "usable_mean_slope_deg_slope5": ("terrain", "derived", "deg", "Mean slope of usable land (5% rule)"),
    "usable_mean_slope_deg_slope10": ("terrain", "derived", "deg", "Mean slope of usable land (10% rule)"),
    "usable_mean_slope_deg_slope15": ("terrain", "derived", "deg", "Mean slope of usable land (15% rule)"),
    # land / capacity
    "buildable_base_acres": ("land", "derived", "acres", "Polygon minus buildings, surface water, NWI wetland"),
    "usable_acres_slope5": ("land", "approximated", "acres", "Usable acres (5% slope rule)"),
    "usable_acres_slope10": ("land", "approximated", "acres", "Usable acres (10% slope rule)"),
    "usable_acres_slope15": ("land", "approximated", "acres", "Usable acres (15% slope rule)"),
    "usable_acres_slope5_nwi_not_excluded": ("land", "approximated", "acres", "Usable acres, 5% rule, NWI not excluded"),
    "usable_acres_slope10_nwi_not_excluded": ("land", "approximated", "acres", "Usable acres, 10% rule, NWI not excluded"),
    "usable_acres_slope15_nwi_not_excluded": ("land", "approximated", "acres", "Usable acres, 15% rule, NWI not excluded"),
    "estimated_max_capacity_mw_ac": ("capacity", "approximated", "MW AC", "Max supportable capacity (10% rule)"),
    "estimated_max_capacity_mw_dc": ("capacity", "approximated", "MW DC", "Max supportable capacity (10% rule)"),
    "annual_mwh_per_mw_ac": ("solar", "approximated", "MWh/yr per MW AC", "Modelled annual generation per MW AC"),
    "ac_capacity_factor": ("solar", "approximated", "fraction", "Modelled AC capacity factor"),
    # grid
    "grid_line_distance_km": ("grid", "derived", "km", "Distance to mapped >=69 kV transmission line (current OSM)"),
    "nearest_line_kv": ("grid", "derived", "kV", "Voltage tag of that line"),
    "substation_distance_km": ("grid", "derived", "km", "Distance to mapped >=69 kV substation (current OSM)"),
    "road_distance_km": ("grid", "derived", "km", "Distance to drivable road (OSM)"),
    # environment
    "nwi_data_status": ("environment", "status", None, "NWI coverage status"),
    "nwi_wetland_overlap_acres": ("environment", "derived", "acres", "NWI vegetated-wetland overlap"),
    "nwi_wetland_overlap_pct": ("environment", "derived", "%", "NWI vegetated-wetland overlap"),
    "nwi_water_overlap_pct": ("environment", "derived", "%", "NWI water-class overlap (riverine/pond/lake)"),
    "nwi_mapping_image_year": ("environment", "source", "year", "NWI source imagery year"),
    "surface_water_overlap_pct": ("environment", "derived", "%", "Current mapped surface water (OSM) overlap"),
    "osm_mapped_wetland_overlap_pct": ("environment", "derived", "%", "OSM natural=wetland overlap (incomplete; context)"),
    "fema_flood_data_status": ("environment", "status", None, "FEMA flood screening status"),
    "fema_flood_overlap_pct": ("environment", "status", "%", "FEMA SFHA overlap (null until assessed)"),
    "aec_data_status": ("environment", "status", None, "DEQ Areas of Environmental Concern status"),
}

WARNINGS = {
    "grid": "Distance to mapped transmission infrastructure is a screening proxy and does not indicate "
            "interconnection capacity, queue position, cost, or availability.",
    "epa": "EPA RE-Powering attributes are screening values from the EPA dataset's vintage and may not reflect "
           "current site or infrastructure conditions.",
    "capacity": "Capacity estimates are planning-level screening estimates based on documented land-use "
                "assumptions, not engineering designs.",
    "terrain": "Terrain metrics are derived from USGS 3DEP elevation data (survey dates vary) and are intended for screening.",
    "wetlands": "NWI overlap indicates mapped wetland features (NC imagery largely 1980s) and is not a jurisdictional determination.",
    "brownfields": "Inclusion in a brownfields dataset does not establish that the property is currently available "
                   "or approved for solar development.",
    "flood": "Flood exposure has not yet been assessed (FEMA data not integrated).",
    "generation": "Annual generation is a planning estimate (PVWatts on NSRDB typical-year weather), ~10% above "
                  "observed NC fleet output.",
}
