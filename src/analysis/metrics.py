"""Small, solar-agnostic geometry/metric helpers."""
import json

import geopandas as gpd
import numpy as np
import pandas as pd


def max_voltage_kv(tags_json) -> float:
    """Highest voltage (kV) in an OSM `voltage` tag such as '230000;115000'. NaN if absent/garbled."""
    if not tags_json:
        return np.nan
    tags = json.loads(tags_json) if isinstance(tags_json, str) else tags_json
    v = tags.get("voltage")
    if not v:
        return np.nan
    vals = []
    for part in str(v).replace(",", ";").split(";"):
        try:
            vals.append(float(part.strip()))
        except ValueError:
            pass
    return max(vals) / 1000.0 if vals else np.nan


def nearest_distance_km(src: gpd.GeoDataFrame, targets: gpd.GeoDataFrame, id_col: str,
                        keep=()) -> pd.DataFrame:
    """Planar distance (km) from each `src` geometry to the nearest `targets` geometry.

    Both inputs must share a projected metre CRS. Distance is 0 when they intersect.
    Ties are broken by the first match. Returns columns: distance_km, target id, and `keep` columns.
    """
    assert src.crs == targets.crs and src.crs.is_projected
    j = gpd.sjoin_nearest(src[[id_col, "geometry"]], targets[["geometry", *keep]],
                          how="left", distance_col="_d")
    j = j[~j.index.duplicated(keep="first")]
    out = j[[id_col, *keep]].copy()
    out["distance_km"] = j["_d"] / 1000.0
    return out.reset_index(drop=True)
