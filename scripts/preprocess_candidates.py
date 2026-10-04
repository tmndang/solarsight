"""Build the reconciled candidate universe (v2).

Source hierarchy (docs/METHODOLOGY.md §2):
  1. NC DEQ Brownfields Program project polygons  -> primary for brownfields (authoritative boundary + status)
  2. OSM landuse=landfill / quarry polygons (Overture) -> footprints for landfills and quarries
     (no authoritative polygon source available); enriched with EPA RE-Powering NC landfill points
  3. OSM landuse=brownfield polygons only where no DEQ polygon covers them (low confidence)
  EPA RE-Powering is used for cross-reference (IDs, acreage, EPA screening fields, landfill permits),
  never to replace polygons with points.

Inputs : data/interim/deq_brownfields.parquet, data/interim/epa_repowering_nc.parquet
         data/raw/overture_land_use_candidates.parquet, nc_boundary, nc_counties,
         data/raw/overture_buildings_candidates.parquet, overture_power (existing solar), EIA PV plants
Output : data/processed/candidates.parquet (EPSG:4326)
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd

from _common import RAW, PROCESSED, METRIC_CRS, OVERTURE_RELEASE
from ingest_authoritative import INTERIM
from src.analysis.assumptions import ASSUMPTIONS
from src.analysis.matching import match_records
from src.analysis.status import classify, landfill_closure_evidence

SQM_PER_ACRE = 4046.8564224
LANDFILL_PROGRAMS = ["NORTH CAROLINA PERMITTED SOLID WASTE LANDFILLS", "NORTH CAROLINA PREREGULATORY LANDFILLS",
                     "LANDFILL METHANE OUTREACH PROGRAM"]
LANDFILL_MATCH_TOL_M = 250.0  # EPA landfill points are address/entrance geocodes
EPA_VINTAGE = ("EPA RE-Powering Mapper screening dataset as downloaded (vintage not stated in the files; "
               "EPA user guide/data documentation dated 2022)")


def lifecycle_inactive(tags: dict) -> bool:
    keys = set(tags)
    txt = " ".join(str(v).lower() for v in tags.values())
    return bool(keys & {"abandoned", "disused", "disused:landuse", "abandoned:landuse", "demolished:power"}
                or any(w in txt for w in ("former", "closed", "disused", "abandoned")))


def extraction_tags(tags: dict) -> bool:
    return bool({"operator", "resource"} & set(tags)) or tags.get("man_made") == "mine"


def osm_candidates(nc_land):
    raw = gpd.read_parquet(RAW / "overture_land_use_candidates.parquet").to_crs(METRIC_CRS)
    g = raw[raw.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    g["geometry"] = g.geometry.make_valid()
    g = g[g.representative_point().within(nc_land)].copy()
    g["gross_area_acres"] = g.area / SQM_PER_ACRE
    # within-OSM de-duplication: drop a polygon >= 50% inside a larger candidate
    g = g.sort_values("gross_area_acres", ascending=False).reset_index(drop=True)
    drop = set()
    for i, geom in enumerate(g.geometry):
        if i in drop:
            continue
        for j in g.sindex.query(geom, predicate="intersects"):
            if j > i and j not in drop and g.geometry.iloc[j].intersection(geom).area >= 0.5 * g.geometry.iloc[j].area:
                drop.add(j)
    g = g.drop(index=list(drop))
    tags = g.source_tags.apply(lambda s: json.loads(s) if s else {})
    rid = g.osm_record_id.str.split("@").str[0]
    return gpd.GeoDataFrame({
        "site_id": "OSM-" + rid, "name": g["name"], "site_type": g["class"],
        "primary_source": "osm_overture", "source_id": rid,
        "source_dataset": f"OpenStreetMap landuse={'{class}'} via Overture Maps base/land_use {OVERTURE_RELEASE}",
        "source_date": OVERTURE_RELEASE,
        "osm_lifecycle_inactive": tags.apply(lifecycle_inactive).values,
        "osm_extraction_tags": tags.apply(extraction_tags).values,
        "osm_operator": tags.apply(lambda t: t.get("operator")).values,
        "osm_tags_json": g.source_tags.values,
    }, geometry=g.geometry.values, crs=METRIC_CRS).assign(
        source_dataset=lambda d: d.apply(lambda r: r.source_dataset.replace("{class}", r.site_type), axis=1))


def deq_candidates(epa):
    deq = gpd.read_parquet(INTERIM / "deq_brownfields.parquet")
    ebf = epa[epa.Program.isin(["NORTH CAROLINA BROWNFIELD PROJECTS", "BROWNFIELDS"])].copy()
    ebf["epa_key"] = ebf.Program.map({"NORTH CAROLINA BROWNFIELD PROJECTS": "NCBF", "BROWNFIELDS": "ACRES"}) \
        + ":" + ebf.SiteID.astype(str)
    m = match_records(deq, ebf, left_id="BF_Number", right_id="epa_key", id_pairs=("BF_Number", "SiteID"),
                      name_cols=("BF_Name", "SiteName"), addr_cols=("Address", "Address"),
                      city_cols=("City", "City"), spatial=True)
    e = ebf.set_index("epa_key")
    def pick(col):
        return m.match_id.map(lambda k: e.at[k, col] if k is not None else np.nan)
    c = gpd.GeoDataFrame({
        "site_id": "DEQ-" + deq.BF_Number, "name": deq.BF_Name.str.strip(), "site_type": "brownfield",
        "primary_source": "nc_deq_brownfields", "source_id": deq.BF_Number,
        "source_dataset": "NC DEQ Brownfields Program project boundaries (NCBP_Project_Poly, manual download)",
        "source_date": deq.EditDate.max().strftime("%Y-%m-%d"),
        "address": deq.Address, "city": deq.City, "deq_county": deq.County,
        "deq_status": deq.Status, "deq_status_date": deq.Status_Date.astype(str),
        "deq_reported_acres": deq.BF_Acreage, "deq_allowed_use": deq.Allowed_Use,
        "deq_restricted_media": deq.Restricted_Media, "deq_primary_contaminant": deq.COC,
        "deq_contamination_source": deq.Source, "deq_instrument_status": deq.Instrument_Status,
        "deq_docs_link": deq.Rec_Docs_Link, "deq_geometry_valid_in_source": deq.deq_geometry_valid_in_source,
        "deq_part_count": deq.deq_part_count,
        "epa_match_method": m.match_method.fillna("unmatched").values,
        "epa_match_confidence": m.match_confidence.fillna("unmatched").values,
        "epa_match_n_candidates": m.match_n_candidates.values,
        "epa_program": pick("Program").values,
        "epa_cross_reference_number": pick("Ref").values,
        "epa_site_id": pick("SiteID").values,
        "epa_screening_acres": pick("Acreage").values,
        "epa_estimated_pv_capacity_mw": pick("EstPVCap").values,          # EPA: acres/6.9, AC/DC unspecified
        "epa_max_annual_ghi_kwh_m2_day": pick("GHI").values,
        "epa_utility_scale_pv": pick("UtilPV").values,
        "epa_distributed_scale_pv": pick("DistribPV").values,
        "epa_solar_installation_potential": pick("SolarInstallationPotential").values,
        "epa_transmission_distance_miles": pick("TransDist").values,
        "epa_transmission_kv": pick("TLkV").values,
        "epa_transmission_status": pick("TLStatus").values,
        "epa_substation_distance_miles": pick("SSDist").values,
        "epa_substation_voltage_kv": pick("SSVoltage").values,
        "epa_road_distance_miles": pick("RdDist").values,
        "epa_rail_distance_miles": pick("RailDist").values,
        "epa_lat": pick("Latitude").values, "epa_lon": pick("Longitude").values,
        "epa_screening_vintage": np.where(m.match_id.notna(), EPA_VINTAGE, None),
    }, geometry=deq.geometry.values, crs=METRIC_CRS)
    # other EPA RE-Powering records (any program) located inside the DEQ polygon: context only
    li, ri = epa.to_crs(METRIC_CRS).sindex.query(c.geometry.values, predicate="contains")
    cnt = pd.Series(ri).groupby(li).size()
    c["epa_records_within_polygon"] = pd.Series(cnt, index=range(len(c))).fillna(0).astype(int).values
    unmatched_epa = ebf[(ebf.Program == "NORTH CAROLINA BROWNFIELD PROJECTS") & ~ebf.epa_key.isin(m.match_id)]
    print(f"DEQ<->EPA: {m.match_method.value_counts(dropna=False).to_dict()}; "
          f"EPA NC brownfield projects without DEQ polygon: {len(unmatched_epa)}")
    return c


def attach_landfill_records(c, epa):
    lf = epa[epa.Program.isin(LANDFILL_PROGRAMS)].to_crs(METRIC_CRS)
    is_lf = c.site_type.eq("landfill")
    li, ri = lf.sindex.query(c.geometry[is_lf].buffer(LANDFILL_MATCH_TOL_M).values, predicate="intersects")
    idx = c.index[is_lf]
    recs = {i: [] for i in idx}
    for a, b in zip(li, ri):
        recs[idx[a]].append(b)
    ev, js = {}, {}
    for i, rows in recs.items():
        r = lf.iloc[rows][["Program", "SiteID", "SiteName"]]
        ev[i] = landfill_closure_evidence(r)
        js[i] = r.to_json(orient="records") if len(r) else None
    c["landfill_closure_evidence"] = pd.Series(ev)
    c["epa_landfill_records_json"] = pd.Series(js)
    c["epa_landfill_match_rule"] = np.where(is_lf, f"EPA landfill point within {LANDFILL_MATCH_TOL_M:.0f} m of polygon", None)
    return c


def building_coverage(c):
    f = RAW / "overture_buildings_candidates.parquet"
    if not f.exists():
        c["building_coverage_pct"] = np.nan
        return c
    b = gpd.read_parquet(f).to_crs(METRIC_CRS)
    b = b[b.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    li, ri = b.sindex.query(c.geometry.values, predicate="intersects")
    cov = np.zeros(len(c))
    for i in np.unique(li):
        u = b.geometry.iloc[ri[li == i]].union_all()
        cov[i] = c.geometry.iloc[i].intersection(u).area
    c["building_footprint_acres"] = cov / SQM_PER_ACRE
    c["building_coverage_pct"] = 100 * cov / c.area.values
    return c


def existing_solar(c):
    p = gpd.read_parquet(RAW / "overture_power.parquet")
    tags = p.source_tags.apply(lambda s: json.loads(s) if s else {})
    sol = p[p["class"].isin(["plant", "generator"]) & p.geometry.geom_type.isin(["Polygon", "MultiPolygon"])
            & ((tags.apply(lambda t: t.get("plant:source")) == "solar")
               | (tags.apply(lambda t: t.get("generator:source")) == "solar"))].to_crs(METRIC_CRS)
    li, ri = sol.sindex.query(c.geometry.values, predicate="intersects")
    area = np.zeros(len(c))
    for i in np.unique(li):
        area[i] = c.geometry.iloc[i].intersection(sol.geometry.iloc[ri[li == i]].union_all()).area
    c["existing_solar_overlap_pct"] = 100 * area / c.area.values
    eia = pd.read_parquet(RAW / "eia_nc_solar_generators.parquet").sort_values("report_date")
    eia = eia.groupby("plant_id_eia").last().reset_index()
    eia = eia[eia.operational_status == "existing"].dropna(subset=["latitude", "longitude"])
    eg = gpd.GeoDataFrame(eia[["plant_id_eia"]], geometry=gpd.points_from_xy(eia.longitude, eia.latitude),
                          crs="EPSG:4326").to_crs(METRIC_CRS)
    j = gpd.sjoin(eg, c[["site_id", "geometry"]], predicate="within")
    c["eia_pv_plants_on_site"] = c.site_id.map(j.groupby("site_id").plant_id_eia.nunique()).fillna(0).astype(int)
    c["has_existing_solar"] = (c.existing_solar_overlap_pct >= 10) | (c.eia_pv_plants_on_site > 0)
    return c


def main():
    nc = gpd.read_parquet(RAW / "nc_boundary.parquet")
    nc_land = nc[nc["class"] == "land"].to_crs(METRIC_CRS).geometry.union_all()
    counties = gpd.read_parquet(RAW / "nc_counties.parquet").to_crs(METRIC_CRS)
    epa = gpd.read_parquet(INTERIM / "epa_repowering_nc.parquet")

    deq = deq_candidates(epa)
    deq.to_crs("EPSG:4326").to_parquet(PROCESSED / "deq_epa_match.parquet")  # all 1,363 DEQ projects
    osm = osm_candidates(nc_land)
    # reconcile OSM with DEQ: an OSM polygon >= 50% covered by DEQ polygons is the same land -> DEQ wins
    deq_u = deq.geometry.union_all()
    cov = osm.geometry.intersection(deq_u).area / osm.area
    osm["covered_by_deq_pct"] = 100 * cov
    dropped = osm[(cov >= 0.5)]
    osm = osm[cov < 0.5].copy()
    # DEQ records overlapping a retained OSM landfill/quarry: keep both, cross-reference
    li, ri = osm.sindex.query(deq.geometry.values, predicate="intersects")
    rel = pd.DataFrame({"d": deq.site_id.values[li], "o": osm.site_id.values[ri]}).groupby("d").o.apply(list)
    deq["overlapping_osm_ids"] = deq.site_id.map(lambda s: json.dumps(rel.get(s)) if s in rel.index else None)

    c = pd.concat([deq, osm], ignore_index=True)
    c = gpd.GeoDataFrame(c, geometry="geometry", crs=METRIC_CRS)
    c["gross_area_acres"] = c.area / SQM_PER_ACRE
    n_all = len(c)
    c = c[c.gross_area_acres >= ASSUMPTIONS["min_gross_acres_pool"]].reset_index(drop=True)

    rp = gpd.GeoDataFrame(geometry=c.representative_point(), crs=METRIC_CRS)
    j = gpd.sjoin(rp, counties[["name", "geometry"]], how="left", predicate="within")
    c["county"] = j["name"].groupby(level=0).first().reindex(c.index).str.replace(" County", "", regex=False)
    c["county"] = c["county"].fillna(c.get("deq_county"))
    c["name"] = c["name"].where(c["name"].notna() & (c["name"].astype(str).str.len() > 0),
                                "Unnamed " + c.site_type + " (" + c.county.fillna("?") + " Co.)")
    c["source_geometry_type"] = "polygon"

    c = attach_landfill_records(c, epa)
    c = building_coverage(c)
    c = existing_solar(c)
    st = c.apply(classify, axis=1, result_type="expand")
    c = pd.concat([c, st], axis=1)

    assert c.site_id.is_unique
    out = gpd.GeoDataFrame(c, geometry="geometry", crs=METRIC_CRS).to_crs("EPSG:4326")
    pt = out.geometry.representative_point()
    out["latitude"], out["longitude"] = pt.y.round(5), pt.x.round(5)
    out.to_parquet(PROCESSED / "candidates.parquet")
    print(f"pool: DEQ {len(deq)} + OSM {len(osm) + len(dropped)} (OSM dropped as covered by DEQ: {len(dropped)}) "
          f"= {n_all}; >= {ASSUMPTIONS['min_gross_acres_pool']} gross ac: {len(out)}")
    print(pd.crosstab(out.site_type, out.candidate_status, margins=True).to_string())
    print(pd.crosstab(out.primary_source, out.screening_confidence).to_string())


if __name__ == "__main__":
    main()
