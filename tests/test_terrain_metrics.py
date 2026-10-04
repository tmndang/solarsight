import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import LineString, Point, box

from src.analysis.metrics import max_voltage_kv, nearest_distance_km
from src.analysis.terrain import horn_slope_pct, pct_to_deg


def test_horn_slope_on_tilted_plane():
    # z rises 1 m per 10 m in x -> 10 % slope, 5.71 deg
    x = np.arange(20) * 10.0
    dem = np.tile(x * 0.1, (15, 1))
    s = horn_slope_pct(dem, 10.0, 10.0)
    assert np.isnan(s[0, 0])  # border has no full 3x3 neighbourhood
    assert np.nanmax(np.abs(s[1:-1, 1:-1] - 10.0)) < 1e-9
    assert pct_to_deg(10.0) == pytest.approx(5.7106, abs=1e-3)


def test_horn_slope_flat_and_diagonal():
    assert np.nanmax(horn_slope_pct(np.full((5, 5), 7.0), 10, 10)) == 0
    yy, xx = np.mgrid[0:10, 0:10] * 10.0
    s = horn_slope_pct(0.03 * xx + 0.04 * yy, 10, 10)
    assert np.nanmean(s) == pytest.approx(5.0)  # hypot(3, 4) %


def test_voltage_parsing():
    assert max_voltage_kv('{"voltage": "230000;115000"}') == 230
    assert max_voltage_kv({"voltage": "44000"}) == 44
    assert np.isnan(max_voltage_kv('{"power": "line"}'))
    assert np.isnan(max_voltage_kv(None))
    assert np.isnan(max_voltage_kv({"voltage": "medium"}))


def test_nearest_distance_polygon_edge_and_intersection():
    crs = "EPSG:32119"
    sites = gpd.GeoDataFrame({"site_id": ["a", "b"]}, geometry=[box(0, 0, 100, 100), box(0, 0, 10, 10)], crs=crs)
    lines = gpd.GeoDataFrame({"kv": [115.0]}, geometry=[LineString([(1100, -50), (1100, 500)])], crs=crs)
    out = nearest_distance_km(sites, lines, "site_id", keep=["kv"]).set_index("site_id")
    assert out.loc["a", "distance_km"] == pytest.approx(1.0)   # measured from polygon edge, not centroid
    assert out.loc["b", "distance_km"] == pytest.approx(1.09)
    crossing = gpd.GeoDataFrame(geometry=[LineString([(50, -10), (50, 200)])], crs=crs)
    assert nearest_distance_km(sites, crossing, "site_id").distance_km.iloc[0] == 0


def test_nearest_distance_rejects_geographic_crs():
    s = gpd.GeoDataFrame({"site_id": [1]}, geometry=[Point(0, 0)], crs="EPSG:4326")
    with pytest.raises(AssertionError):
        nearest_distance_km(s, s, "site_id")
