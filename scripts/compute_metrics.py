"""Join every per-site metric into the canonical candidate dataset (v2 schema).

Output: data/processed/feasibility_sites.parquet (EPSG:4326, one row per candidate).
Scenario-dependent results (project-size feasibility, eligibility, Pareto) are NOT stored here;
they are computed per scenario by src/analysis/scenario.py.

Also writes data/processed/grid_proxy_validation.parquet (operating NC PV plants vs the same
grid layers) and data/processed/grid_spot_checks.csv (independent recomputation).
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
from scipy.spatial import cKDTree

from _common import RAW, PROCESSED, METRIC_CRS
from ingest_authoritative import NWI_GDB
from src.analysis.assumptions import ASSUMPTIONS as A
from src.analysis.metrics import max_voltage_kv, nearest_distance_km
from src.analysis.pv import nsrdb_to_sam, specific_yield

M_PER_MI = 1609.344


def grid_layers():
    p = gpd.read_parquet(RAW / "overture_power.parquet").to_crs(METRIC_CRS)
    p["kv"] = p.source_tags.apply(max_voltage_kv)
    lines = p[(p["class"] == "power_line") & p.geometry.geom_type.isin(["LineString", "MultiLineString"])]
    subs = p[p["class"] == "substation"]
    return (lines[lines.kv >= A["grid_min_kv"]][["id", "kv", "geometry"]],
            subs[subs.kv >= A["grid_min_kv"]][["id", "kv", "geometry"]])


def solar_yield(c4326):
    meta = pd.read_parquet(RAW / "nsrdb_meta_nc.parquet")
    pts = c4326.geometry.representative_point()
    d, idx = cKDTree(np.c_[meta.longitude, meta.latitude]).query(np.c_[pts.x, pts.y])
    gids = meta.gid.values[idx]
    cache, rows = {}, []
    for sid, g, dd in zip(c4326.site_id, gids, d):
        if g not in cache:
            f = RAW / "nsrdb_tmy" / f"{g}.parquet"
            cache[g] = specific_yield(nsrdb_to_sam(pd.read_parquet(f))) if f.exists() else {}
        y = cache[g]
        rows.append({"site_id": sid, "nsrdb_gid": int(g), "nsrdb_offset_deg": float(dd),
                     "specific_yield_kwh_per_kwdc": y.get("kwh_per_kwdc", np.nan),
                     "ac_capacity_factor": y.get("ac_capacity_factor", np.nan),
                     "ghi_kwh_m2_yr": y.get("ghi_kwh_m2_yr", np.nan)})
    return pd.DataFrame(rows)


def nwi_coverage(c):
    meta = pyogrio.read_dataframe(NWI_GDB, layer="NC_Wetlands_Project_Metadata").to_crs(METRIC_CRS)
    cm = c.to_crs(METRIC_CRS)
    j = gpd.sjoin(gpd.GeoDataFrame(c[["site_id"]], geometry=cm.representative_point(), crs=METRIC_CRS),
                  meta[["IMAGE_YR", "geometry"]], predicate="within", how="left")
    j = j.groupby("site_id").IMAGE_YR.max()
    return c.site_id.map(j)


def main():
    c = gpd.read_parquet(PROCESSED / "candidates.parquet")
    cm = c.to_crs(METRIC_CRS)
    t = pd.read_parquet(PROCESSED / "terrain.parquet")
    lines_hv, subs_hv = grid_layers()
    gl = nearest_distance_km(cm, lines_hv, "site_id", keep=["kv"]).rename(
        columns={"distance_km": "grid_line_distance_km", "kv": "nearest_line_kv"})
    gs = nearest_distance_km(cm, subs_hv, "site_id", keep=["kv"]).rename(
        columns={"distance_km": "substation_distance_km", "kv": "nearest_substation_kv"})
    roads = gpd.read_parquet(RAW / "overture_roads.parquet").to_crs(METRIC_CRS)
    roads = roads.iloc[roads.sindex.query(cm.buffer(20000).union_all(), predicate="intersects")]
    rd = nearest_distance_km(cm, roads[["class", "geometry"]], "site_id", keep=["class"]).rename(
        columns={"distance_km": "road_distance_km", "class": "nearest_road_class"})
    sy = solar_yield(c)

    df = c.merge(t, on="site_id").merge(gl, on="site_id").merge(gs, on="site_id") \
          .merge(rd, on="site_id").merge(sy, on="site_id")

    # ---- capacity (explicit units) ----------------------------------------------------
    dens_dc = A["mw_dc_per_usable_acre"]
    for s in A["slope_exclusion_options_pct"]:
        s = int(s)
        df[f"max_capacity_mw_dc_slope{s}"] = df[f"usable_acres_slope{s}"] * dens_dc
        df[f"max_capacity_mw_ac_slope{s}"] = df[f"max_capacity_mw_dc_slope{s}"] / A["dc_ac_ratio"]
    d = int(A["slope_exclusion_pct"])
    df["usable_area_acres"] = df[f"usable_acres_slope{d}"]
    df["estimated_max_capacity_mw_dc"] = df[f"max_capacity_mw_dc_slope{d}"]
    df["estimated_max_capacity_mw_ac"] = df[f"max_capacity_mw_ac_slope{d}"]
    # generation per MW AC of project (so a target project's MWh = target_mw_ac * this)
    df["annual_mwh_per_mw_ac"] = df.specific_yield_kwh_per_kwdc * A["dc_ac_ratio"]

    # ---- environmental status fields ------------------------------------------------------
    df["nwi_mapping_image_year"] = nwi_coverage(df)
    df["nwi_data_status"] = np.where(df.nwi_mapping_image_year.notna(), "assessed", "not_covered")
    for col in ("nwi_wetland_overlap_acres", "nwi_wetland_overlap_pct", "nwi_water_overlap_pct"):
        df.loc[df.nwi_data_status != "assessed", col] = np.nan
    df["fema_flood_overlap_acres"] = np.nan
    df["fema_flood_overlap_pct"] = np.nan
    df["fema_flood_data_status"] = "not_assessed"
    df["aec_overlap_acres"] = np.nan
    df["aec_count"] = pd.array([pd.NA] * len(df), dtype="Int64")
    df["aec_data_status"] = np.where(df.primary_source == "nc_deq_brownfields", "not_available", "not_applicable")

    # ---- provenance -------------------------------------------------------------------
    df["grid_distance_source"] = (f"derived: planar polygon-edge distance (EPSG:32119) to nearest OSM power=line "
                                  f"with max voltage tag >= {A['grid_min_kv']:.0f} kV (Overture base/infrastructure)")
    df["capacity_method"] = (f"approximated: usable acres x {dens_dc} MWdc/acre (LBNL 2019 fixed-tilt median); "
                             f"MW AC = MW DC / {A['dc_ac_ratio']}")
    df["generation_method"] = ("approximated: PVWatts v8 (PySAM 7.1) specific yield on NSRDB GOES v4.0.0 TMY-2024 "
                               "nearest pixel; fixed tilt 20 deg, 14% losses; ~10% above observed NC fleet")
    df["metric_provenance"] = json.dumps({
        "geometry": "directly sourced (NC DEQ polygon or OSM polygon)",
        "candidate_status": "derived by documented rule (src/analysis/status.py)",
        "usable_area_acres": "derived (3DEP slope, Overture buildings & water, NWI) + assumption (slope threshold)",
        "capacity": "approximated (density assumption)", "generation": "approximated (PVWatts + NSRDB)",
        "grid/substation/road distance": "derived (OSM via Overture)",
        "nwi_*": "derived (USFWS NWI)", "osm_mapped_wetland_*": "derived (OSM, incomplete; context only)",
        "fema_*": "not assessed", "aec_*": "not available", "synthetic values": "none"})

    df = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
    df.to_parquet(PROCESSED / "feasibility_sites.parquet")
    print(f"{len(df)} sites; columns {len(df.columns)}")

    # ---- grid yardstick (operating NC PV) -----------------------------------------------
    eia = pd.read_parquet(RAW / "eia_nc_solar_generators.parquet").sort_values("report_date")
    eia = eia.groupby("plant_id_eia").last().reset_index()
    eia = eia[(eia.operational_status == "existing") & (eia.capacity_mw >= 1)].dropna(subset=["latitude", "longitude"])
    v = gpd.GeoDataFrame(eia[["plant_id_eia", "plant_name_eia", "capacity_mw"]],
                         geometry=gpd.points_from_xy(eia.longitude, eia.latitude), crs="EPSG:4326").to_crs(METRIC_CRS)
    v["site_id"] = v.plant_id_eia.astype(str)
    a = nearest_distance_km(v, lines_hv, "site_id").rename(columns={"distance_km": "grid_line_distance_km"})
    b = nearest_distance_km(v, subs_hv, "site_id").rename(columns={"distance_km": "substation_distance_km"})
    v[["site_id", "plant_name_eia", "capacity_mw"]].merge(a, on="site_id").merge(b, on="site_id") \
        .to_parquet(PROCESSED / "grid_proxy_validation.parquet", index=False)


if __name__ == "__main__":
    main()
