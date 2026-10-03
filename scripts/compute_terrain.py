"""Per-site terrain statistics and approximate usable area.

For each candidate polygon:
  1. read the cached 3DEP clip (EPSG:4269, ~1/3 arc-second)
  2. reproject to EPSG:32119 (NAD83 / North Carolina, metres) on a 10 m grid, bilinear
  3. Horn slope in percent -> degrees (never computed on lat/lon degrees)
  4. rasterise the candidate polygon (pixel-centre rule) and the exclusion layers
     (OSM/Overture water polygons, OSM wetland polygons) on the same grid
  5. aggregate: mean / p90 slope (deg) over all valid candidate pixels,
     share of pixels above slope thresholds, water / wetland overlap,
     usable area = candidate pixels that are not water, not wetland and below the slope threshold

Output: data/processed/terrain.parquet (one row per site_id)
"""
from multiprocessing import Pool

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize
from rasterio.warp import reproject, Resampling, calculate_default_transform

from _common import RAW, PROCESSED, METRIC_CRS
from src.analysis.assumptions import ASSUMPTIONS
from src.analysis.terrain import horn_slope_pct, pct_to_deg

RES = 10.0
SQM_PER_ACRE = 4046.8564224
THRESH = ASSUMPTIONS["slope_exclusion_sensitivity_pct"]
_LAYERS = {}


def _init():
    _LAYERS["water"] = gpd.read_parquet(PROCESSED / "_water_near_candidates.parquet")
    _LAYERS["wetland"] = gpd.read_parquet(PROCESSED / "_wetland_near_candidates.parquet")


def _burn(layer, geom_bbox, shape, transform):
    lyr = _LAYERS[layer]
    hits = lyr.iloc[lyr.sindex.query(geom_bbox, predicate="intersects")]
    if hits.empty:
        return np.zeros(shape, bool)
    return rasterize(((g, 1) for g in hits.geometry), out_shape=shape, transform=transform,
                     fill=0, dtype="uint8").astype(bool)


def site_terrain(args):
    site_id, geom = args  # geom in METRIC_CRS
    with rasterio.open(RAW / "dem" / f"{site_id}.tif") as src:
        dem = src.read(1).astype("float64")
        dem[dem == src.nodata] = np.nan
        transform, w, h = calculate_default_transform(src.crs, METRIC_CRS, src.width, src.height,
                                                      *src.bounds, resolution=RES)
        dst = np.full((h, w), np.nan)
        reproject(dem, dst, src_transform=src.transform, src_crs=src.crs, dst_transform=transform,
                  dst_crs=METRIC_CRS, resampling=Resampling.bilinear, src_nodata=np.nan, dst_nodata=np.nan)
    slope_pct = horn_slope_pct(dst, RES, RES)
    site = rasterize([(geom, 1)], out_shape=dst.shape, transform=transform, fill=0, dtype="uint8").astype(bool)
    valid = site & np.isfinite(slope_pct)
    n_site, n_valid = int(site.sum()), int(valid.sum())
    from shapely.geometry import box
    bb = box(*geom.bounds)
    water = _burn("water", bb, dst.shape, transform) & site
    wet = _burn("wetland", bb, dst.shape, transform) & site
    px_ac = RES * RES / SQM_PER_ACRE
    s = slope_pct[valid]
    rec = {
        "site_id": site_id,
        "dem_pixels": n_site,
        "dem_valid_frac": n_valid / n_site if n_site else np.nan,
        "mean_slope_deg": float(pct_to_deg(s).mean()) if n_valid else np.nan,
        "p90_slope_deg": float(np.percentile(pct_to_deg(s), 90)) if n_valid else np.nan,
        "median_slope_deg": float(np.median(pct_to_deg(s))) if n_valid else np.nan,
        "elev_min_m": float(np.nanmin(dst[site])) if n_valid else np.nan,
        "elev_max_m": float(np.nanmax(dst[site])) if n_valid else np.nan,
        "water_overlap_pct": 100 * water.sum() / n_site if n_site else np.nan,
        "osm_wetland_overlap_pct": 100 * wet.sum() / n_site if n_site else np.nan,
        "osm_wetland_overlap_acres": wet.sum() * px_ac,
        "raster_area_acres": n_site * px_ac,
    }
    base_ok = valid & ~water & ~wet
    for t in THRESH:
        rec[f"steep_gt{int(t)}pct_share"] = float((s > t).mean()) if n_valid else np.nan
        rec[f"usable_acres_slope{int(t)}"] = (base_ok & (slope_pct <= t)).sum() * px_ac
    # usable-area pixels' own slope (the slope of the land you would actually build on)
    t0 = ASSUMPTIONS["slope_exclusion_pct"]
    ub = base_ok & (slope_pct <= t0)
    rec["usable_mean_slope_deg"] = float(pct_to_deg(slope_pct[ub]).mean()) if ub.any() else np.nan
    return rec


def main():
    c = gpd.read_parquet(PROCESSED / "candidates.parquet").to_crs(METRIC_CRS)
    hull = c.buffer(50).union_all()
    for name, f in [("water", "overture_water.parquet"), ("wetland", "overture_land_wetland.parquet")]:
        lyr = gpd.read_parquet(RAW / f).to_crs(METRIC_CRS)
        lyr = lyr.iloc[lyr.sindex.query(hull, predicate="intersects")]
        lyr[["id", "class", "geometry"]].to_parquet(PROCESSED / f"_{name}_near_candidates.parquet")
        print(name, "features near candidates:", len(lyr))
    jobs = list(zip(c.site_id, c.geometry))
    with Pool(8, initializer=_init) as p:
        rows = p.map(site_terrain, jobs, chunksize=4)
    df = pd.DataFrame(rows)
    df["slope_source"] = "USGS 3DEP 1/3 arc-second DEM (current), reprojected to EPSG:32119 @10 m, Horn slope"
    df.to_parquet(PROCESSED / "terrain.parquet", index=False)
    for f in ("_water_near_candidates.parquet", "_wetland_near_candidates.parquet"):
        (PROCESSED / f).unlink()
    print(df.describe().T.round(2).to_string())


if __name__ == "__main__":
    main()
