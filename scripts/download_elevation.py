"""Clip USGS 3DEP 1/3 arc-second DEM windows for every candidate site.

Source: s3://prd-tnm/StagedProducts/Elevation/13/TIFF/current/n{lat}w{lon}/USGS_13_n{lat}w{lon}.tif
(public USGS bucket; cloud-optimised GeoTIFF, EPSG:4269, ~1/3 arc-second, float32 metres,
nodata -999999). Only the window around each candidate (+BUFFER_M) is read via HTTP range
requests; tiles are merged when a site straddles a 1-degree tile edge.

Output: data/raw/dem/<site_id>.tif  (native CRS/resolution; reprojection happens in compute_terrain.py)
"""
import math
import os
from multiprocessing import Pool

import geopandas as gpd
import rasterio
from rasterio.merge import merge

from _common import RAW, PROCESSED

BUFFER_DEG = 0.003  # ~300 m pad so slope kernels at polygon edges have neighbours
URL = "/vsicurl/https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/{t}/USGS_13_{t}.tif"
OUT = RAW / "dem"


def _gdal_env():
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        os.environ.setdefault("GDAL_HTTP_PROXY", proxy.replace("http://", ""))
    os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
    os.environ["GDAL_HTTP_MAX_RETRY"] = "5"
    os.environ["GDAL_HTTP_RETRY_DELAY"] = "2"


def tiles_for(bounds):
    xmin, ymin, xmax, ymax = bounds
    out = []
    for lat in range(math.ceil(ymin), math.ceil(ymax) + 1):
        for lon in range(math.ceil(-xmax), math.ceil(-xmin) + 1):
            out.append(f"n{lat:02d}w{lon:03d}")
    return out


def fetch(args):
    site_id, bounds = args
    path = OUT / f"{site_id}.tif"
    if path.exists():
        return f"{site_id}: cached"
    _gdal_env()
    xmin, ymin, xmax, ymax = bounds
    b = (xmin - BUFFER_DEG, ymin - BUFFER_DEG, xmax + BUFFER_DEG, ymax + BUFFER_DEG)
    srcs = [rasterio.open(URL.format(t=t)) for t in tiles_for(b)]
    try:
        arr, transform = merge(srcs, bounds=b, nodata=-999999.0)
        prof = srcs[0].profile.copy()
        prof.update(driver="GTiff", height=arr.shape[1], width=arr.shape[2], transform=transform,
                    count=1, tiled=False, compress="deflate", nodata=-999999.0)
        prof.pop("blockxsize", None); prof.pop("blockysize", None)
        with rasterio.open(path, "w", **prof) as dst:
            dst.write(arr[0], 1)
            dst.update_tags(source=";".join(URL.format(t=t)[9:] for t in tiles_for(b)))
    finally:
        for s in srcs:
            s.close()
    return f"{site_id}: {arr.shape[1]}x{arr.shape[2]} from {len(srcs)} tile(s)"


def main():
    OUT.mkdir(exist_ok=True)
    c = gpd.read_parquet(PROCESSED / "candidates.parquet").to_crs("EPSG:4269")
    jobs = [(r.site_id, r.geometry.bounds) for r in c.itertuples()]
    with Pool(8) as p:
        for i, msg in enumerate(p.imap_unordered(fetch, jobs), 1):
            if i % 20 == 0 or "cached" not in msg:
                print(f"[{i}/{len(jobs)}] {msg}", flush=True)


if __name__ == "__main__":
    main()
