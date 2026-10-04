"""Cache NREL NSRDB (GOES v4.0.0, TMY-2024) hourly data for candidate sites.

Source: s3://nrel-pds-nsrdb/GOES/tmy/v4.0.0/nsrdb_tmy-2024.h5 (public AWS Open Data).
The file is ~930 GB; we read only the `meta` table and the columns (sites) we
need via HTTP range requests, so nothing large is downloaded.

Step 1 (`meta`):   cache the NC subset of the site table -> data/raw/nsrdb_meta_nc.parquet
Step 2 (`sites`):  for each candidate (data/processed/candidates.parquet) pick the
                   nearest NSRDB pixel and cache its 8760-h weather to
                   data/raw/nsrdb_tmy/<gid>.parquet
"""
import sys
import time

import numpy as np
import pandas as pd

from _common import RAW, PROCESSED, NC_BBOX, NSRDB_TMY_URL, NSRDB_TMY_SIZE

VARS = ["ghi", "dni", "dhi", "air_temperature", "wind_speed"]  # PVWatts inputs


def open_h5():
    import fsspec, h5py

    fs = fsspec.filesystem("http", client_kwargs={"trust_env": True})
    f = fs.open(NSRDB_TMY_URL, "rb", block_size=4 * 2**20, cache_type="bytes", size=NSRDB_TMY_SIZE)
    return h5py.File(f, "r")


def cache_meta():
    out = RAW / "nsrdb_meta_nc.parquet"
    if out.exists():
        print("exists", out)
        return
    t = time.time()
    h = open_h5()
    meta = h["meta"][:]
    df = pd.DataFrame({
        "gid": np.arange(len(meta)),
        "latitude": meta["latitude"], "longitude": meta["longitude"],
        "elevation": meta["elevation"], "timezone": meta["timezone"],
        "state": [s.decode() for s in meta["state"]],
    })
    xmin, ymin, xmax, ymax = NC_BBOX
    pad = 0.1
    df = df[df.longitude.between(xmin - pad, xmax + pad) & df.latitude.between(ymin - pad, ymax + pad)]
    df.to_parquet(out, index=False)
    print(f"cached {len(df)} NSRDB pixels in NC bbox ({time.time()-t:.0f}s); states:", df.state.value_counts().head().to_dict())


def _eia_validation_points(n=60):
    """Sample of operating NC fixed-tilt PV plants (EIA-860) for PVWatts validation."""
    g = pd.read_parquet(RAW / "eia_nc_solar_generators.parquet")
    g = g[(pd.to_datetime(g.report_date).dt.year == 2024) & (g.capacity_mw >= 1)
          & (g.uses_technology_fixed_tilt == True) & (g.capacity_factor > 0.05)]  # noqa: E712
    g = g.drop_duplicates("plant_id_eia").dropna(subset=["latitude", "longitude"])
    g = g.sample(min(n, len(g)), random_state=42)
    return g.longitude.values, g.latitude.values


def cache_sites(which="candidates"):
    import geopandas as gpd
    from scipy.spatial import cKDTree

    meta = pd.read_parquet(RAW / "nsrdb_meta_nc.parquet")
    if which == "eia":
        x, y = _eia_validation_points()
    else:
        cands = gpd.read_parquet(PROCESSED / "candidates.parquet")
        pts = cands.geometry.to_crs("EPSG:4326").representative_point()
        x, y = pts.x.values, pts.y.values
    tree = cKDTree(np.c_[meta.longitude, meta.latitude])
    _, idx = tree.query(np.c_[x, y])
    gids = sorted(set(meta.gid.values[idx].tolist()))
    outdir = RAW / "nsrdb_tmy"
    outdir.mkdir(exist_ok=True)
    todo = [g for g in gids if not (outdir / f"{g}.parquet").exists()]
    print(f"{len(gids)} unique NSRDB pixels, {len(todo)} to fetch")
    if not todo:
        return
    # The h5 datasets are chunked (2000 h x 500 sites); group gids by chunk column
    # so that each chunk is fetched once, and fetch chunk groups in parallel processes.
    groups = {}
    for g in todo:
        groups.setdefault(g // CHUNK_SITES, []).append(g)
    from multiprocessing import Pool
    with Pool(N_WORKERS) as pool:
        for msg in pool.imap_unordered(_fetch_group, list(groups.values())):
            print(msg, flush=True)


CHUNK_SITES = 500
N_WORKERS = 6


def _fetch_group(gids):
    t = time.time()
    meta = pd.read_parquet(RAW / "nsrdb_meta_nc.parquet").set_index("gid")
    h = open_h5()
    ti = pd.to_datetime([s.decode() for s in h["time_index"][:]])
    lo, hi = min(gids), max(gids) + 1
    block = {}
    for v in VARS:
        d = h[v]
        scale = float(d.attrs.get("psm_scale_factor", 1.0))
        block[v] = d[:, lo:hi].astype("float32") / scale
    for g in gids:
        df = pd.DataFrame({v: block[v][:, g - lo] for v in VARS}, index=ti)
        df.index.name = "time_utc"
        m = meta.loc[g]
        df["lat"], df["lon"] = float(m.latitude), float(m.longitude)
        df["elevation"], df["tz"] = float(m.elevation), int(m.timezone)
        df.to_parquet(RAW / "nsrdb_tmy" / f"{g}.parquet")
    return f"gids {gids}: {time.time()-t:.0f}s"


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else "meta"
    {"meta": cache_meta, "sites": cache_sites, "eia": lambda: cache_sites("eia")}[step]()
