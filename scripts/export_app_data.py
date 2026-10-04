"""Export the frozen, offline app dataset.

Input : data/processed/feasibility_sites.parquet
Output: data/app/candidates.geojson  simplified polygons (~5 m tolerance, metrics computed on full geometry)
        data/app/meta.json           assumptions + basis, field dictionary (group/provenance/unit/label),
                                     status enums, scenario defaults, warnings, sources
The frontend recomputes feasibility and Pareto client-side from these two files.
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd

from _common import ROOT, RAW, PROCESSED, METRIC_CRS
from src.analysis.assumptions import ASSUMPTIONS, ASSUMPTION_BASIS, mw_ac_per_usable_acre
from src.analysis.schema import FIELDS, WARNINGS
from src.analysis.status import STATUSES, DEFAULT_ELIGIBLE_STATUSES, LANDFILL_SCENARIO_STATUSES

APP = ROOT / "data" / "app"
SIMPLIFY_M = 5.0


def main():
    APP.mkdir(parents=True, exist_ok=True)
    d = gpd.read_parquet(PROCESSED / "feasibility_sites.parquet")
    cols = [c for c in FIELDS if c in d.columns]
    missing = [c for c in FIELDS if c not in d.columns]
    assert not missing, missing
    g = d[cols + ["geometry"]].copy()
    g["geometry"] = g.to_crs(METRIC_CRS).geometry.simplify(SIMPLIFY_M, preserve_topology=True).to_crs(4326).values
    # Numeric properties are exported at FULL precision: the browser re-runs the Pareto engine and
    # must see the same values as the Python reference (rounding to 4 dp once turned 0.81038 vs
    # 0.81040 into a tie and changed dominance tie-breaks).
    # NaN in float columns is written as JSON null by GDAL; do NOT replace with None (that turns the
    # column into object dtype and GDAL then writes every value as a string).
    g.to_file(APP / "candidates.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
    meta = {
        "dataset_version": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d"),
        "n_candidates": len(g),
        "assumptions": ASSUMPTIONS, "assumption_basis": ASSUMPTION_BASIS,
        "derived_constants": {"mw_ac_per_usable_acre": mw_ac_per_usable_acre(),
                              "required_usable_acres_formula": "target_mw_ac / mw_ac_per_usable_acre",
                              "target_annual_mwh_formula": "target_mw_ac * annual_mwh_per_mw_ac"},
        "fields": {k: dict(zip(["group", "provenance", "unit", "label"], v)) for k, v in FIELDS.items()},
        "statuses": STATUSES,
        "scenarios": {
            "brownfields_baseline": {"site_types": ["brownfield"], "statuses": DEFAULT_ELIGIBLE_STATUSES},
            "landfills_secondary": {"site_types": ["landfill"], "statuses": LANDFILL_SCENARIO_STATUSES},
            "quarries_exploratory": {"site_types": ["quarry"], "statuses": ["likely_closed"]},
        },
        "pareto": {"objectives": [["grid_line_distance_km", "minimize"],
                                  ["usable_mean_slope_deg_slope{slope_threshold_pct}", "minimize"]],
                   "feasibility": "usable_acres_slope{slope_threshold_pct}[_nwi_not_excluded] >= required_usable_acres",
                   "missing_values": "excluded from analysis, never imputed"},
        "warnings": WARNINGS,
    }
    (APP / "meta.json").write_text(json.dumps(meta, indent=1, default=str))
    # Local context layer for the basemap fallback (NC counties, simplified ~200 m). Optional input.
    cty = RAW / "nc_counties.parquet"
    if cty.exists():
        c = gpd.read_parquet(cty)[["name", "geometry"]].to_crs(METRIC_CRS)
        c["geometry"] = c.geometry.simplify(200, preserve_topology=True)
        c.to_crs(4326).to_file(APP / "context.geojson", driver="GeoJSON", COORDINATE_PRECISION=4)
    size = (APP / "candidates.geojson").stat().st_size / 1e6
    print(f"exported {len(g)} candidates, {len(cols)} fields, candidates.geojson {size:.2f} MB")


if __name__ == "__main__":
    main()
