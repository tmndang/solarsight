"""Shared paths and constants for the feasibility-spike scripts."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
RAW.mkdir(parents=True, exist_ok=True)
PROCESSED.mkdir(parents=True, exist_ok=True)

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# North Carolina bounding box (WGS84) used only to pre-filter remote queries;
# the exact state polygon is applied afterwards.
NC_BBOX = (-84.33, 33.84, -75.45, 36.59)  # xmin, ymin, xmax, ymax

# Projected CRS for all metric (distance/area/slope) work:
# NAD83 / North Carolina (ftUS) is EPSG:2264; we use the metre variant EPSG:32119.
METRIC_CRS = "EPSG:32119"

OVERTURE_RELEASE = "2026-09-23.1"
OVERTURE_S3 = f"s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}"

NSRDB_TMY_URL = (
    "https://nrel-pds-nsrdb.s3.us-west-2.amazonaws.com/GOES/tmy/v4.0.0/nsrdb_tmy-2024.h5"
)
NSRDB_TMY_SIZE = 928896657438  # bytes, from the S3 bucket listing


def overture_fs():
    """Anonymous pyarrow S3 filesystem routed through the HTTPS proxy (if any)."""
    import os
    import pyarrow.fs as pafs

    kw = dict(anonymous=True, region="us-west-2", connect_timeout=30, request_timeout=300)
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        kw["proxy_options"] = proxy
    return pafs.S3FileSystem(**kw)


def fetch_overture(theme, otype, extra_filter=None, columns=None, bbox=NC_BBOX):
    """Read Overture features intersecting `bbox` (row-group pruning via bbox stats).

    Returns a GeoDataFrame in EPSG:4326. Requires no DuckDB extensions.
    """
    import geopandas as gpd
    import pyarrow.dataset as ds
    import shapely

    fs = overture_fs()
    path = f"overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme={theme}/type={otype}/"
    d = ds.dataset(path, filesystem=fs, format="parquet")
    xmin, ymin, xmax, ymax = bbox
    f = ((ds.field("bbox", "xmin") < xmax) & (ds.field("bbox", "xmax") > xmin)
         & (ds.field("bbox", "ymin") < ymax) & (ds.field("bbox", "ymax") > ymin))
    if extra_filter is not None:
        f = f & extra_filter
    cols = columns or ["id", "geometry", "subtype", "class"]
    tbl = d.to_table(columns=cols, filter=f)
    df = tbl.to_pandas()
    geom = shapely.from_wkb(df.pop("geometry").values)
    return gpd.GeoDataFrame(df, geometry=geom, crs="EPSG:4326")


def duck():
    """DuckDB connection configured for anonymous S3 reads through the HTTPS proxy."""
    import duckdb, os

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_region='us-west-2';")
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        con.execute(f"SET http_proxy='{proxy.replace('http://', '')}';")
    return con
