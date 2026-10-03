"""Per-site terrain statistics, environmental overlaps and usable area (10 m grid).

For each candidate polygon:
  1. read the cached 3DEP clip (EPSG:4269, ~1/3 arc-second)
  2. reproject to EPSG:32119 (NAD83 / North Carolina, metres) at 10 m, bilinear
  3. Horn slope in percent -> degrees (never computed on lat/lon degrees)
  4. rasterise on the same grid (pixel-centre rule): the candidate polygon, building footprints
     (Overture), current surface water (OSM/Overture base/water), USFWS NWI polygons split into
     vegetated-wetland classes and water classes, and OSM natural=wetland (context only)
  5. aggregate:
       whole-site slope: mean / median / p90, share above 5/10/15/25 %
       buildable base   = site - buildings - surface water - NWI vegetated wetland
       usable_acres_slope{T} = buildable base pixels with slope <= T %   (T in 5, 10, 15)
       usable_mean_slope_deg_slope{T}, terrain_loss_pct_slope{T} = 1 - usable/buildable base
       overlaps (acres and % of site) for every layer, each with its own explicit source name

Output: data/processed/terrain.parquet (one row per site_id)
"""
from multiprocessing import Pool

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize
from rasterio.warp import reproject, Resampling, calculate_default_transform
from shapely.geometry import box

from _common import RAW, PROCESSED, METRIC_CRS
from ingest_authoritative import read_nwi
from src.analysis.terrain import horn_slope_pct, pct_to_deg

RES = 10.0
SQM_PER_ACRE = 4046.8564224
THRESH = [5, 10, 15]
EXTREME = 25  # % slope; used only to test terrain formulations B/C
NWI_VEGETATED = {"Freshwater Forested/Shrub Wetland", "Freshwater Emergent Wetland", "Estuarine and Marine Wetland"}
NWI_WATER = {"Riverine", "Freshwater Pond", "Lake", "Estuarine and Marine Deepwater"}
_LAYERS = {}
_TMP = PROCESSED.parent / "interim"


def _init():
    for k in ("water", "osm_wetland", "nwi_veg", "nwi_water", "nwi_other", "buildings"):
        _LAYERS[k] = gpd.read_parquet(_TMP / f"_terrain_{k}.parquet")


def _burn(layer, bbox, shape, transform):
    lyr = _LAYERS[layer]
    hits = lyr.iloc[lyr.sindex.query(bbox, predicate="intersects")]
    if hits.empty:
        return np.zeros(shape, bool)
    return rasterize(((g, 1) for g in hits.geometry), out_shape=shape, transform=transform,
                     fill=0, dtype="uint8").astype(bool)


def site_terrain(args):
    site_id, geom = args
    with rasterio.open(RAW / "dem" / f"{site_id}.tif") as src:
        dem = src.read(1).astype("float64")
        dem[dem == src.nodata] = np.nan
        transform, w, h = calculate_default_transform(src.crs, METRIC_CRS, src.width, src.height,
                                                      *src.bounds, resolution=RES)
        dst = np.full((h, w), np.nan)
        reproject(dem, dst, src_transform=src.transform, src_crs=src.crs, dst_transform=transform,
                  dst_crs=METRIC_CRS, resampling=Resampling.bilinear, src_nodata=np.nan, dst_nodata=np.nan)
    slope = horn_slope_pct(dst, RES, RES)
    site = rasterize([(geom, 1)], out_shape=dst.shape, transform=transform, fill=0, dtype="uint8").astype(bool)
    valid = site & np.isfinite(slope)
    n_site, n_valid = int(site.sum()), int(valid.sum())
    bb = box(*geom.bounds)
    m = {k: _burn(k, bb, dst.shape, transform) & site
         for k in ("water", "osm_wetland", "nwi_veg", "nwi_water", "nwi_other", "buildings")}
    px_ac = RES * RES / SQM_PER_ACRE
    s = slope[valid]
    deg = pct_to_deg(s)
    rec = {"site_id": site_id, "dem_pixels": n_site, "raster_area_acres": n_site * px_ac,
           "dem_valid_frac": n_valid / n_site if n_site else np.nan}
    if n_valid:
        rec.update(mean_slope_deg=float(deg.mean()), median_slope_deg=float(np.median(deg)),
                   p90_slope_deg=float(np.percentile(deg, 90)),
                   elev_min_m=float(np.nanmin(dst[valid])), elev_max_m=float(np.nanmax(dst[valid])))
        for t in THRESH + [EXTREME]:
            rec[f"steep_gt{t}pct_share"] = float((s > t).mean())
    for k, name in [("water", "surface_water"), ("osm_wetland", "osm_mapped_wetland"),
                    ("nwi_veg", "nwi_wetland"), ("nwi_water", "nwi_water"), ("nwi_other", "nwi_other"),
                    ("buildings", "building")]:
        rec[f"{name}_overlap_acres"] = m[k].sum() * px_ac
        rec[f"{name}_overlap_pct"] = 100 * m[k].sum() / n_site if n_site else np.nan
    base = valid & ~m["buildings"] & ~m["water"] & ~m["nwi_veg"]
    rec["buildable_base_acres"] = base.sum() * px_ac
    base_noext = base & (slope <= EXTREME)
    rec[f"mean_slope_deg_lt{EXTREME}pct_base"] = float(pct_to_deg(slope[base_noext]).mean()) if base_noext.any() else np.nan
    rec[f"steep_gt10pct_share_of_lt{EXTREME}pct_base"] = float((slope[base_noext] > 10).mean()) if base_noext.any() else np.nan
    rec[f"usable_acres_lt{EXTREME}pct"] = base_noext.sum() * px_ac
    for t in THRESH:
        u = base & (slope <= t)
        rec[f"usable_acres_slope{t}"] = u.sum() * px_ac
        rec[f"usable_mean_slope_deg_slope{t}"] = float(pct_to_deg(slope[u]).mean()) if u.any() else np.nan
        rec[f"terrain_loss_pct_slope{t}"] = 100 * (1 - u.sum() / base.sum()) if base.any() else np.nan
        # scenario variant: NWI wetlands NOT removed (switchable assumption)
        rec[f"usable_acres_slope{t}_nwi_not_excluded"] = (valid & ~m["buildings"] & ~m["water"]
                                                          & (slope <= t)).sum() * px_ac
    return rec


def main():
    c = gpd.read_parquet(PROCESSED / "candidates.parquet").to_crs(METRIC_CRS)
    hull = c.buffer(50).union_all()
    layers = {
        "water": gpd.read_parquet(RAW / "overture_water.parquet"),
        "osm_wetland": gpd.read_parquet(RAW / "overture_land_wetland.parquet"),
        "buildings": gpd.read_parquet(RAW / "overture_buildings_candidates.parquet"),
    }
    nwi = read_nwi(gpd.GeoSeries([hull], crs=METRIC_CRS).to_crs("EPSG:4326").iloc[0])
    print("NWI polygons intersecting candidate hull:", len(nwi), nwi.crs)
    layers["nwi_veg"] = nwi[nwi.WETLAND_TYPE.isin(NWI_VEGETATED)]
    layers["nwi_water"] = nwi[nwi.WETLAND_TYPE.isin(NWI_WATER)]
    layers["nwi_other"] = nwi[~nwi.WETLAND_TYPE.isin(NWI_VEGETATED | NWI_WATER)]
    for k, lyr in layers.items():
        lyr = lyr.to_crs(METRIC_CRS)
        lyr = lyr[lyr.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
        lyr = lyr.iloc[lyr.sindex.query(hull, predicate="intersects")]
        lyr[["geometry"]].to_parquet(_TMP / f"_terrain_{k}.parquet")
        print(k, "features near candidates:", len(lyr))
    with Pool(8, initializer=_init) as p:
        rows = p.map(site_terrain, list(zip(c.site_id, c.geometry)), chunksize=4)
    df = pd.DataFrame(rows)
    df["slope_source"] = "USGS 3DEP 1/3 arc-second DEM (current), reprojected to EPSG:32119 @10 m, Horn slope"
    df["nwi_source"] = "USFWS National Wetlands Inventory, NC state geodatabase (manual download), NC_Wetlands layer"
    df.to_parquet(PROCESSED / "terrain.parquet", index=False)
    for f in _TMP.glob("_terrain_*.parquet"):
        f.unlink()
    print(df.describe().T.round(2).to_string())


if __name__ == "__main__":
    main()
