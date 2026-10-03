"""Build the candidate-site table from OSM disturbed-land polygons (via Overture).

Input : data/raw/overture_land_use_candidates.parquet  (OSM landuse=landfill|brownfield|quarry)
        data/raw/nc_boundary.parquet, data/raw/nc_counties.parquet
Output: data/processed/candidates.parquet  (EPSG:4326 polygons + candidate attributes)

Rules (all documented in docs/METHODOLOGY.md):
  * keep polygons whose representative point lies inside the NC land boundary
  * resolve overlaps: if >=50% of a polygon lies inside a larger candidate, drop it
    (OSM sometimes maps a landfill cell inside a larger landfill, or a quarry pit inside
    a quarry); the larger, more inclusive outline is kept
  * keep gross area >= MIN_GROSS_ACRES (a pool filter, not the final hard constraint)
  * derive an `osm_status_hint` from lifecycle tags (abandoned/disused/description);
    absence of such tags does NOT mean the site is closed or open.
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd

from _common import RAW, PROCESSED, METRIC_CRS
from src.analysis.assumptions import ASSUMPTIONS

SQM_PER_ACRE = 4046.8564224


def status_hint(tags: dict) -> str:
    keys = set(tags)
    txt = " ".join(str(v).lower() for v in tags.values())
    if keys & {"abandoned", "disused", "disused:landuse", "abandoned:landuse", "demolished:power"} \
            or "former" in txt or "closed" in txt or "disused" in txt or "abandoned" in txt:
        return "tagged_inactive_or_former"
    return "no_lifecycle_tag"


def main():
    raw = gpd.read_parquet(RAW / "overture_land_use_candidates.parquet")
    nc = gpd.read_parquet(RAW / "nc_boundary.parquet")
    nc_land = nc[nc["class"] == "land"].to_crs(METRIC_CRS).geometry.union_all()
    counties = gpd.read_parquet(RAW / "nc_counties.parquet").to_crs(METRIC_CRS)

    g = raw.to_crs(METRIC_CRS)
    g = g[g.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    g["geometry"] = g.geometry.make_valid()
    g = g[g.representative_point().within(nc_land)].copy()
    g["gross_area_acres"] = g.area / SQM_PER_ACRE
    n_in_nc = len(g)

    # overlap resolution: largest first
    g = g.sort_values("gross_area_acres", ascending=False).reset_index(drop=True)
    sidx = g.sindex
    drop = set()
    for i, geom in enumerate(g.geometry):
        if i in drop:
            continue
        for j in sidx.query(geom, predicate="intersects"):
            if j <= i or j in drop:
                continue
            gj = g.geometry.iloc[j]
            if gj.intersection(geom).area >= 0.5 * gj.area:
                drop.add(j)
    g = g.drop(index=list(drop))
    n_dedup = len(g)

    g = g[g.gross_area_acres >= ASSUMPTIONS["min_gross_acres_pool"]].copy()

    tags = g.source_tags.apply(lambda s: json.loads(s) if s else {})
    g["osm_status_hint"] = tags.apply(status_hint)
    g["osm_operator"] = tags.apply(lambda t: t.get("operator"))
    g["candidate_type"] = g["class"]

    # county by representative point
    rp = gpd.GeoDataFrame(geometry=g.representative_point(), crs=METRIC_CRS)
    j = gpd.sjoin(rp, counties[["name", "geometry"]], how="left", predicate="within")
    g["county"] = j["name"].groupby(level=0).first().reindex(g.index).str.replace(" County", "", regex=False)

    g["name"] = g["name"].where(g["name"].notna(),
                                "Unnamed " + g["class"] + " (" + g["county"].fillna("?") + " Co.)")
    g = g.sort_values(["candidate_type", "gross_area_acres"], ascending=[True, False])
    g["site_id"] = [f"NC-{t[:2].upper()}-{i:03d}" for i, t in
                    zip(g.groupby("candidate_type").cumcount() + 1, g.candidate_type)]
    g["candidate_source"] = "OpenStreetMap landuse=" + g["class"] + " via Overture Maps " \
        + "base/land_use (" + g["osm_record_id"].fillna("") + ")"
    g["source_tags_json"] = g["source_tags"]

    out = g[["site_id", "name", "candidate_type", "county", "gross_area_acres", "osm_status_hint",
             "osm_operator", "osm_record_id", "candidate_source", "source_tags_json", "geometry"]]
    out = out.to_crs("EPSG:4326")
    c = out.geometry.representative_point()
    out.insert(4, "latitude", c.y.round(5))
    out.insert(5, "longitude", c.x.round(5))
    out.to_parquet(PROCESSED / "candidates.parquet")
    print(f"raw={len(raw)} in_nc={n_in_nc} after_overlap_dedup={n_dedup} "
          f">= {ASSUMPTIONS['min_gross_acres_pool']} ac={len(out)}")
    print(out.groupby("candidate_type").gross_area_acres.describe().round(1))
    print(out.osm_status_hint.value_counts())


if __name__ == "__main__":
    main()
