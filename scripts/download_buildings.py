"""Download Overture building footprints that intersect candidate polygons.

Used to measure how much of each candidate is already covered by buildings (a direct, observable
indicator that a brownfield has been redeveloped / is occupied) and to remove roofs from
ground-mount usable area.

Source: s3://overturemaps-us-west-2/release/<OVERTURE_RELEASE>/theme=buildings/type=building/
(OSM + Microsoft/Google ML footprints, ODbL/CDLA). One scan with an OR of clustered candidate
bounding boxes (each file footer is read once; ~5-10 min).
Inputs: raw NC DEQ brownfield polygons + raw OSM candidate polygons (no dependency on later steps).
Output: data/raw/overture_buildings_candidates.parquet
"""
import time

import geopandas as gpd
import pandas as pd
import pyarrow.dataset as ds
import shapely

from _common import RAW, OVERTURE_RELEASE, overture_fs
from ingest_authoritative import read_deq_brownfields

PAD = 0.0005  # deg (~50 m)


def candidate_bounds():
    deq = read_deq_brownfields().to_crs("EPSG:4326")[["geometry"]]
    osm = gpd.read_parquet(RAW / "overture_land_use_candidates.parquet")[["geometry"]]
    g = pd.concat([deq, osm], ignore_index=True)
    b = g.bounds
    cell = (g.centroid.x // 0.1).astype(int).astype(str) + "_" + (g.centroid.y // 0.1).astype(int).astype(str)
    agg = b.groupby(cell).agg(minx=("minx", "min"), miny=("miny", "min"), maxx=("maxx", "max"), maxy=("maxy", "max"))
    return agg, g


def main():
    agg, g = candidate_bounds()
    f = None
    for r in agg.itertuples():
        c = ((ds.field("bbox", "xmin") < r.maxx + PAD) & (ds.field("bbox", "xmax") > r.minx - PAD)
             & (ds.field("bbox", "ymin") < r.maxy + PAD) & (ds.field("bbox", "ymax") > r.miny - PAD))
        f = c if f is None else (f | c)
    print(f"{len(agg)} bbox clusters for {len(g)} polygons")
    t = time.time()
    d = ds.dataset(f"overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme=buildings/type=building/",
                   filesystem=overture_fs(), format="parquet")
    tb = d.to_table(columns=["id", "geometry"], filter=f).to_pandas()
    b = gpd.GeoDataFrame(tb[["id"]], geometry=shapely.from_wkb(tb.geometry.values), crs="EPSG:4326")
    # keep only buildings that actually touch a candidate polygon
    hit = b.sindex.query(g.geometry.values, predicate="intersects")[1]
    b = b.iloc[sorted(set(hit))]
    b.to_parquet(RAW / "overture_buildings_candidates.parquet")
    print(f"{len(tb)} buildings in clusters, {len(b)} touching candidates ({time.time()-t:.0f}s)")


if __name__ == "__main__":
    main()
