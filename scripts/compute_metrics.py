"""Join every per-site metric into data/processed/feasibility_sites.parquet.

Inputs (all produced by the download/compute scripts; no network needed here):
  data/processed/candidates.parquet, data/processed/terrain.parquet
  data/raw/overture_power.parquet, data/raw/overture_roads.parquet
  data/raw/nsrdb_tmy/<gid>.parquet, data/raw/nsrdb_meta_nc.parquet
  data/raw/eia_nc_solar_generators.parquet
Also writes data/processed/grid_proxy_validation.parquet: distance from operating NC
PV plants (EIA-860 coordinates) to the same mapped grid layers, as an empirical yardstick.
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from _common import RAW, PROCESSED, METRIC_CRS
from src.analysis.assumptions import ASSUMPTIONS
from src.analysis.metrics import max_voltage_kv, nearest_distance_km
from src.analysis.pv import nsrdb_to_sam, specific_yield

A = ASSUMPTIONS


def grid_layers():
    p = gpd.read_parquet(RAW / "overture_power.parquet").to_crs(METRIC_CRS)
    p["kv"] = p.source_tags.apply(max_voltage_kv)
    lines = p[(p["class"] == "power_line") & p.geometry.geom_type.isin(["LineString", "MultiLineString"])]
    lines_hv = lines[lines.kv >= A["grid_min_kv"]][["id", "kv", "geometry"]]
    subs = p[p["class"] == "substation"]
    subs_hv = subs[subs.kv >= A["grid_min_kv"]][["id", "kv", "geometry"]]
    tags = p.source_tags.apply(lambda s: json.loads(s) if s else {})
    solar = p[(p["class"].isin(["plant", "generator"]))
              & ((tags.apply(lambda t: t.get("plant:source")) == "solar")
                 | (tags.apply(lambda t: t.get("generator:source")) == "solar"))
              & p.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    print(f"lines>={A['grid_min_kv']}kV: {len(lines_hv)} (of {len(lines)}; untagged {lines.kv.isna().sum()}), "
          f"substations>={A['grid_min_kv']}kV: {len(subs_hv)} (of {len(subs)}), OSM solar polygons: {len(solar)}")
    return lines_hv, subs_hv, solar


def solar_yield(c4326):
    meta = pd.read_parquet(RAW / "nsrdb_meta_nc.parquet")
    pts = c4326.geometry.representative_point()
    tree = cKDTree(np.c_[meta.longitude, meta.latitude])
    d, idx = tree.query(np.c_[pts.x, pts.y])
    gids = meta.gid.values[idx]
    cache = {}
    rows = []
    for sid, g, dd in zip(c4326.site_id, gids, d):
        if g not in cache:
            f = RAW / "nsrdb_tmy" / f"{g}.parquet"
            cache[g] = specific_yield(nsrdb_to_sam(pd.read_parquet(f))) if f.exists() else None
        y = cache[g] or {}
        rows.append({"site_id": sid, "nsrdb_gid": int(g), "nsrdb_offset_deg": float(dd), **y})
    return pd.DataFrame(rows)


def main():
    c = gpd.read_parquet(PROCESSED / "candidates.parquet")
    cm = c.to_crs(METRIC_CRS)
    t = pd.read_parquet(PROCESSED / "terrain.parquet")
    lines_hv, subs_hv, solar = grid_layers()

    gl = nearest_distance_km(cm, lines_hv, "site_id", keep=["kv"]).rename(
        columns={"distance_km": "grid_line_distance_km", "kv": "nearest_line_kv"})
    gs = nearest_distance_km(cm, subs_hv, "site_id", keep=["kv"]).rename(
        columns={"distance_km": "substation_distance_km", "kv": "nearest_substation_kv"})

    roads = gpd.read_parquet(RAW / "overture_roads.parquet").to_crs(METRIC_CRS)
    hull = cm.buffer(20000).union_all()
    roads = roads.iloc[roads.sindex.query(hull, predicate="intersects")]
    rd = nearest_distance_km(cm, roads[["class", "geometry"]], "site_id", keep=["class"]).rename(
        columns={"distance_km": "road_distance_km", "class": "nearest_road_class"})

    # existing solar already on the candidate (OSM polygons + EIA plant coordinates)
    inter = gpd.overlay(cm[["site_id", "geometry"]], solar[["geometry"]], how="intersection", keep_geom_type=True)
    sol_area = inter.dissolve("site_id").area if len(inter) else pd.Series(dtype=float)
    eia = pd.read_parquet(RAW / "eia_nc_solar_generators.parquet")
    eia_pl = eia.sort_values("report_date").groupby("plant_id_eia").last().reset_index()
    eia_pl = eia_pl[eia_pl.operational_status == "existing"].dropna(subset=["latitude", "longitude"])
    eia_g = gpd.GeoDataFrame(eia_pl, geometry=gpd.points_from_xy(eia_pl.longitude, eia_pl.latitude),
                             crs="EPSG:4326").to_crs(METRIC_CRS)
    ej = gpd.sjoin(eia_g[["plant_id_eia", "capacity_mw", "geometry"]], cm[["site_id", "geometry"]],
                   predicate="within")
    eia_on = ej.groupby("site_id").agg(eia_pv_plants_on_site=("plant_id_eia", "nunique"),
                                       eia_pv_mwac_on_site=("capacity_mw", "sum"))

    sy = solar_yield(c)

    df = c.merge(t, on="site_id").merge(gl, on="site_id").merge(gs, on="site_id") \
          .merge(rd, on="site_id").merge(sy, on="site_id")
    df["existing_solar_overlap_pct"] = (100 * df.site_id.map(sol_area).fillna(0)
                                        / (df.gross_area_acres * 4046.8564224)).clip(0, 100)
    df = df.merge(eia_on, left_on="site_id", right_index=True, how="left")
    df[["eia_pv_plants_on_site", "eia_pv_mwac_on_site"]] = df[["eia_pv_plants_on_site", "eia_pv_mwac_on_site"]].fillna(0)

    # generation (default slope rule) + sensitivity
    tsl = int(A["slope_exclusion_pct"])
    df["usable_area_acres"] = df[f"usable_acres_slope{tsl}"]
    df["usable_fraction"] = df.usable_area_acres / df.raster_area_acres
    df["estimated_capacity_mwdc"] = df.usable_area_acres * A["mwdc_per_usable_acre"]
    df["estimated_capacity_mwac"] = df.estimated_capacity_mwdc / A["dc_ac_ratio"]
    df["estimated_annual_mwh"] = df.estimated_capacity_mwdc * df.kwh_per_kwdc  # MWdc * MWh/MWdc
    df["mwh_per_usable_acre"] = df.estimated_annual_mwh / df.usable_area_acres
    for s in A["slope_exclusion_sensitivity_pct"]:
        df[f"estimated_annual_mwh_slope{int(s)}"] = df[f"usable_acres_slope{int(s)}"] \
            * A["mwdc_per_usable_acre"] * df.kwh_per_kwdc

    # data that could not be obtained in this environment: explicit NaN, never invented
    df["flood_exposure_pct"] = np.nan
    df["nwi_wetland_overlap_pct"] = np.nan

    df["annual_mwh_method"] = ("approximated: usable_area_acres x 0.35 MWdc/acre (LBNL 2019 fixed-tilt median) x "
                               "PVWatts v8 (PySAM) specific yield on NSRDB GOES v4 TMY-2024 nearest pixel")
    df["grid_distance_source"] = (f"derived: planar distance (EPSG:32119) from polygon to nearest OSM power=line "
                                  f">= {A['grid_min_kv']:.0f} kV (Overture base/infrastructure)")
    df["substation_distance_source"] = (f"derived: distance to nearest OSM power=substation tagged >= "
                                        f"{A['grid_min_kv']:.0f} kV (Overture base/infrastructure)")
    df["road_distance_source"] = "derived: distance to nearest OSM drivable road (Overture transportation/segment)"
    df["wetland_source"] = "derived (incomplete): OSM natural=wetland via Overture base/land; USFWS NWI unavailable"
    df["flood_source"] = "unavailable: FEMA NFHL host blocked in this environment"
    df["metric_provenance"] = json.dumps({
        "candidate geometry": "directly sourced (OSM)",
        "gross_area_acres": "derived", "usable_area_acres": "derived + assumption (slope threshold)",
        "mean_slope_deg/p90_slope_deg": "derived (3DEP)",
        "estimated_capacity_mw*": "approximated (density assumption)",
        "estimated_annual_mwh": "approximated (PVWatts + NSRDB + density)",
        "grid_line_distance_km/substation_distance_km": "derived (OSM)",
        "road_distance_km": "derived (OSM)", "water/wetland overlap": "derived (OSM, incomplete)",
        "flood_exposure_pct": "unavailable", "synthetic": "none"})

    # hard-constraint evaluation (documented in METHODOLOGY.md)
    df["fails_min_usable_area"] = df.usable_area_acres < A["min_usable_acres"]
    df["has_existing_solar"] = (df.existing_solar_overlap_pct >= 10) | (df.eia_pv_plants_on_site > 0)
    df["eligible"] = ~df.fails_min_usable_area & ~df.has_existing_solar

    df = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
    df.to_parquet(PROCESSED / "feasibility_sites.parquet")
    print(f"{len(df)} sites, {df.eligible.sum()} eligible "
          f"(fail area {df.fails_min_usable_area.sum()}, existing solar {df.has_existing_solar.sum()})")
    cols = ["usable_area_acres", "estimated_capacity_mwac", "estimated_annual_mwh", "kwh_per_kwdc",
            "mwh_per_usable_acre", "grid_line_distance_km", "substation_distance_km", "road_distance_km",
            "mean_slope_deg", "p90_slope_deg", "water_overlap_pct"]
    print(df.loc[df.eligible, cols].describe().T.round(2).to_string())

    # --- grid-proxy yardstick: operating NC PV plants ---------------------------------
    v = eia_g[eia_g.capacity_mw >= 1].copy()
    v["site_id"] = v.plant_id_eia.astype(str)
    a = nearest_distance_km(v, lines_hv, "site_id").rename(columns={"distance_km": "grid_line_distance_km"})
    b = nearest_distance_km(v, subs_hv, "site_id").rename(columns={"distance_km": "substation_distance_km"})
    val = v[["site_id", "plant_name_eia", "capacity_mw"]].merge(a, on="site_id").merge(b, on="site_id")
    val.to_parquet(PROCESSED / "grid_proxy_validation.parquet", index=False)
    for lo, hi in [(1, 5.01), (5.01, 20), (20, 1000)]:
        s = val[(val.capacity_mw >= lo) & (val.capacity_mw < hi)]
        print(f"EIA PV plants {lo:g}-{hi:g} MWac (n={len(s)}): line km p50={s.grid_line_distance_km.median():.2f} "
              f"p90={s.grid_line_distance_km.quantile(.9):.2f}; substation km p50={s.substation_distance_km.median():.2f} "
              f"p90={s.substation_distance_km.quantile(.9):.2f}")


if __name__ == "__main__":
    main()
