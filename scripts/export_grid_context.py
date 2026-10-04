"""Export the transmission geometry behind each candidate's grid distance, for the app's selected-site view.

Input : data/processed/feasibility_sites.parquet (full-resolution candidate polygons + grid_line_distance_km)
        data/raw/overture_power.parquet          (same >=69 kV line layer as compute_metrics.grid_layers)
Output: data/app/grid_context.geojson

Per candidate (site_id property on every feature):
  role="line"       the nearest mapped >=69 kV line (the one that defines grid_line_distance_km, same
                    sjoin_nearest tie-break) plus any other >=69 kV line intersecting the site, clipped to a
                    window around the site; properties kv, nearest (bool), intersects_site (bool)
  role="connector"  only when grid_line_distance_km > 0: the shortest segment between the site polygon and
                    that line (shapely nearest_points), property distance_km

The recomputed distance is asserted equal to the exported grid_line_distance_km. This file is display-only:
no scenario, feasibility or Pareto logic reads it.
"""
import json

import geopandas as gpd
import numpy as np
import shapely
from shapely.ops import nearest_points

from _common import ROOT, PROCESSED, METRIC_CRS
from compute_metrics import grid_layers
from src.analysis.metrics import nearest_distance_km

APP = ROOT / "data" / "app"
WINDOW_PAD_M = 1000.0   # line context shown beyond the site / connector
SIMPLIFY_M = 2.0


def r6(geom):
    return shapely.set_precision(geom, 1e-6)


def main():
    d = gpd.read_parquet(PROCESSED / "feasibility_sites.parquet")[["site_id", "grid_line_distance_km", "geometry"]]
    cm = d.to_crs(METRIC_CRS)
    lines, _ = grid_layers()
    lines = lines.reset_index(drop=True)
    near = nearest_distance_km(cm, lines.rename(columns={"id": "line_id"}), "site_id", keep=["line_id", "kv"])
    near = near.set_index("site_id")
    by_line_id = lines.set_index("id")

    feats, stats = [], {"sites": 0, "zero": 0, "zero_crosses_boundary": 0, "zero_inside_only": 0}
    for sid, poly, dist in zip(cm.site_id, cm.geometry, d.grid_line_distance_km):
        if dist is None or not np.isfinite(dist):
            continue
        nl = near.loc[sid]
        line = by_line_id.loc[nl.line_id].geometry
        recomputed = poly.distance(line) / 1000.0
        assert abs(recomputed - dist) < 1e-9, (sid, recomputed, dist)
        stats["sites"] += 1

        window = shapely.box(*poly.bounds).buffer(dist * 1000.0 + WINDOW_PAD_M, join_style="mitre")
        crossing = lines.iloc[lines.sindex.query(poly, predicate="intersects")]
        shown = {nl.line_id: (line, float(nl.kv))}
        for lid, g, kv in zip(crossing.id, crossing.geometry, crossing.kv):
            shown.setdefault(lid, (g, float(kv)))

        if dist == 0:
            stats["zero"] += 1
            if any(g.intersects(poly.boundary) for g, _ in shown.values()):
                stats["zero_crosses_boundary"] += 1
            else:
                stats["zero_inside_only"] += 1

        for lid, (g, kv) in shown.items():
            clip = g.intersection(window).simplify(SIMPLIFY_M)
            if clip.is_empty:
                continue
            feats.append({"site_id": sid, "role": "line", "kv": kv, "nearest": lid == nl.line_id,
                          "intersects_site": bool(g.intersects(poly)), "distance_km": None, "geometry": clip})
        if dist > 0:
            a, b = nearest_points(poly, line)
            feats.append({"site_id": sid, "role": "connector", "kv": float(nl.kv), "nearest": True,
                          "intersects_site": False, "distance_km": float(dist),
                          "geometry": shapely.LineString([a, b])})

    out = gpd.GeoDataFrame(feats, geometry="geometry", crs=METRIC_CRS).to_crs(4326)
    out["geometry"] = [r6(g) for g in out.geometry]
    fc = json.loads(out.to_json(drop_id=True))
    fc["metadata"] = {
        "description": "Display geometry for grid_line_distance_km: nearest mapped >=69 kV line (OSM via Overture) "
                       "and lines intersecting the site, clipped to a window; connector = shortest site-boundary-to-line "
                       "segment. Proximity screening proxy only; not interconnection capacity or availability.",
        "window_pad_m": WINDOW_PAD_M, "simplify_m": SIMPLIFY_M, **stats,
    }
    (APP / "grid_context.geojson").write_text(json.dumps(fc, separators=(",", ":")))
    print(stats, f"{len(out)} features", f"{(APP / 'grid_context.geojson').stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
