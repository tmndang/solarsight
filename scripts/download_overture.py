"""Download the Overture Maps (OpenStreetMap-derived) layers used by the spike.

All layers come from the public, anonymous bucket
s3://overturemaps-us-west-2/release/<OVERTURE_RELEASE>/ (see scripts/_common.py),
filtered to the NC bounding box with row-group bbox pruning. Output: data/raw/*.parquet

Layers
  nc_boundary              divisions/division_area, region == US-NC
  overture_land_use_*      base/land_use  (candidate polygons: landfill, brownfield, quarry)
  overture_power_*         base/infrastructure, subtype == power (lines, substations, plants)
  overture_roads_*         transportation/segment, subtype == road (drivable classes only)
  overture_water_*         base/water (polygons only)
  overture_land_wetland_*  base/land, class in wetland/swamp/marsh/bog (OSM natural=wetland)
"""
import sys
import time

import pyarrow.dataset as ds

from _common import RAW, fetch_overture

ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary",
                "residential", "unclassified", "living_street"]


def _tags_to_dict(x):
    return {} if x is None else {k: v for k, v in x}


def _names_primary(n):
    return None if n is None else n.get("primary")


def save(g, name):
    for col in ("source_tags",):
        if col in g:
            g[col] = g[col].apply(_tags_to_dict).apply(lambda d: d or None)
    if "names" in g:
        g["name"] = g.pop("names").apply(_names_primary)
    if "sources" in g:
        g["osm_record_id"] = g.pop("sources").apply(
            lambda s: None if s is None or len(s) == 0 else s[0]["record_id"])
    # dict columns -> JSON strings for portable parquet
    import json
    if "source_tags" in g:
        g["source_tags"] = g["source_tags"].apply(lambda d: None if d is None else json.dumps(d))
    g.to_parquet(RAW / f"{name}.parquet")
    print(f"{name}: {len(g)} features")


def main(which):
    t = time.time()
    cols = ["id", "geometry", "subtype", "class", "names", "source_tags", "sources"]
    if which in ("all", "boundary"):
        g = fetch_overture("divisions", "division_area",
                           extra_filter=(ds.field("subtype") == "region") & (ds.field("region") == "US-NC"),
                           columns=["id", "geometry", "subtype", "class", "region", "names"])
        save(g, "nc_boundary")
    if which in ("all", "counties"):
        g = fetch_overture("divisions", "division_area",
                           extra_filter=(ds.field("subtype") == "county") & (ds.field("region") == "US-NC")
                           & (ds.field("class") == "land"),
                           columns=["id", "geometry", "subtype", "class", "region", "names"])
        save(g, "nc_counties")
    if which in ("all", "land_use"):
        g = fetch_overture("base", "land_use",
                           extra_filter=ds.field("class").isin(["landfill", "brownfield", "quarry"]),
                           columns=cols)
        save(g, "overture_land_use_candidates")
    if which in ("all", "power"):
        g = fetch_overture("base", "infrastructure",
                           extra_filter=(ds.field("subtype") == "power")
                           & ds.field("class").isin(["power_line", "minor_line", "substation", "plant", "generator"]),
                           columns=cols)
        save(g, "overture_power")
    if which in ("all", "roads"):
        g = fetch_overture("transportation", "segment",
                           extra_filter=(ds.field("subtype") == "road") & ds.field("class").isin(ROAD_CLASSES),
                           columns=["id", "geometry", "subtype", "class"])
        save(g, "overture_roads")
    if which in ("all", "water"):
        g = fetch_overture("base", "water", columns=["id", "geometry", "subtype", "class"])
        g = g[g.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
        save(g, "overture_water")
    if which in ("all", "wetland"):
        g = fetch_overture("base", "land", extra_filter=(ds.field("subtype") == "wetland"),
                           columns=["id", "geometry", "subtype", "class"])
        g = g[g.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
        save(g, "overture_land_wetland")
    print(f"done in {time.time()-t:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
