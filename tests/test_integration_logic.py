"""Tests for authoritative-data integration: matching, status, sizing/units, scenarios, raw loaders."""
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import Point, box

from src.analysis.assumptions import ASSUMPTIONS, mw_ac_per_usable_acre, required_usable_acres
from src.analysis.matching import match_records, norm_text
from src.analysis.pareto import pareto_analysis
from src.analysis.scenario import Scenario, run_scenario, terrain_metric_column
from src.analysis.status import STATUSES, classify, landfill_closure_evidence

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


# ---------------- units / sizing ----------------
def test_ac_dc_unit_consistency():
    a = ASSUMPTIONS
    assert mw_ac_per_usable_acre() == pytest.approx(a["mw_dc_per_usable_acre"] / a["dc_ac_ratio"])
    assert mw_ac_per_usable_acre() == pytest.approx(0.28)
    # 10 MW AC -> 12.5 MW DC -> 35.71 acres at 0.35 MWdc/acre
    acres = required_usable_acres(10)
    assert acres == pytest.approx(10 * a["dc_ac_ratio"] / a["mw_dc_per_usable_acre"])
    assert acres == pytest.approx(35.714, abs=1e-3)
    with pytest.raises(ValueError):
        required_usable_acres(0)


# ---------------- matching ----------------
def test_norm_text():
    assert norm_text("123 Main Street, Suite #4") == "123 MAIN ST SUITE 4"
    assert norm_text("The Former Acme Company") == "ACME CO"
    assert norm_text("   ") is None and norm_text(None) is None and norm_text(np.nan) is None


def _lr():
    left = pd.DataFrame({"lid": ["L1", "L2", "L3", "L4"], "num": ["A-1", "A-2", "A-3", "A-4"],
                         "name": ["Acme Mill", "Blue Plant", "Twin Site", "Nowhere"],
                         "addr": ["1 Main St", "2 Oak Road", "9 Elm St", "7 Pine St"],
                         "city": ["Raleigh", "Durham", "Cary", "Apex"]})
    right = pd.DataFrame({"rid": ["R1", "R2", "R3", "R4"], "num": ["A-1", "X", "Y", "Z"],
                          "name": ["ACME MILL", "BLUE PLANT", "TWIN SITE", "TWIN SITE"],
                          "addr": ["1 MAIN STREET", "2 OAK RD", "9 ELM ST", "9 ELM ST"],
                          "city": ["RALEIGH", "DURHAM", "CARY", "CARY"]})
    return left, right


def test_match_id_then_name_then_ambiguous():
    left, right = _lr()
    m = match_records(left, right, left_id="lid", right_id="rid", id_pairs=("num", "num"),
                      name_cols=("name", "name"), addr_cols=("addr", "addr"), city_cols=("city", "city")).set_index("lid")
    assert (m.loc["L1", "match_id"], m.loc["L1", "match_method"], m.loc["L1", "match_confidence"]) == ("R1", "id", "high")
    assert (m.loc["L2", "match_id"], m.loc["L2", "match_method"]) == ("R2", "name_address")
    # two right records share name+city -> ambiguous, nothing chosen, address rule not applied after
    assert m.loc["L3", "match_id"] is None and m.loc["L3", "match_method"] == "ambiguous_name_address"
    assert m.loc["L3", "match_n_candidates"] == 2
    assert m.loc["L4", "match_id"] is None and m.loc["L4", "match_method"] is None


def test_match_name_city_when_address_differs():
    left = pd.DataFrame({"lid": ["L"], "name": ["Acme Mill"], "addr": ["1 Main St"], "city": ["Raleigh"]})
    right = pd.DataFrame({"rid": ["R"], "name": ["ACME MILL"], "addr": ["99 Other Rd"], "city": ["RALEIGH"]})
    m = match_records(left, right, left_id="lid", right_id="rid", name_cols=("name", "name"),
                      addr_cols=("addr", "addr"), city_cols=("city", "city"))
    assert m.match_method.iloc[0] == "name_city" and m.match_confidence.iloc[0] == "medium"


def test_match_city_must_agree():
    left = pd.DataFrame({"lid": ["L"], "name": ["Acme Mill"], "city": ["Raleigh"]})
    right = pd.DataFrame({"rid": ["R"], "name": ["Acme Mill"], "city": ["Wilson"]})
    m = match_records(left, right, left_id="lid", right_id="rid", name_cols=("name", "name"), city_cols=("city", "city"))
    assert m.match_id.iloc[0] is None


def test_spatial_match_unique_and_ambiguous():
    crs = "EPSG:32119"
    left = gpd.GeoDataFrame({"lid": ["P1", "P2"]}, geometry=[box(0, 0, 100, 100), box(1000, 0, 1100, 100)], crs=crs)
    right = gpd.GeoDataFrame({"rid": ["a", "b", "c"]}, geometry=[Point(50, 50), Point(1050, 50), Point(1060, 60)], crs=crs)
    m = match_records(left, right, left_id="lid", right_id="rid", spatial=True).set_index("lid")
    assert m.loc["P1", "match_id"] == "a" and m.loc["P1", "match_method"] == "spatial"
    assert m.loc["P2", "match_id"] is None and m.loc["P2", "match_method"] == "ambiguous_spatial"


# ---------------- status ----------------
def test_status_rules():
    deq = dict(primary_source="nc_deq_brownfields", site_type="brownfield", building_coverage_pct=3.0)
    r = classify({**deq, "deq_status": "Recorded", "epa_match_method": "id"})
    assert r["candidate_status"] == "deq_brownfield_record" and r["screening_confidence"] == "high"
    assert "Recorded" in r["status_reason"] and "not interpreted" in r["status_reason"]
    # DEQ status is carried, never interpreted: NFI is still a DEQ record
    assert classify({**deq, "deq_status": "No Further Interest"})["candidate_status"] == "deq_brownfield_record"
    assert classify({**deq, "deq_status": "Recorded"})["screening_confidence"] == "medium"  # no EPA match
    assert classify({**deq, "building_coverage_pct": 60})["candidate_status"] == "likely_built_out"
    r = classify({**deq, "building_coverage_pct": np.nan})        # unknown coverage is not zero
    assert r["candidate_status"] == "deq_brownfield_record" and "not assessed" in r["status_reason"]
    osm = dict(primary_source="osm_overture", building_coverage_pct=0.0)
    assert classify({**osm, "site_type": "landfill", "landfill_closure_evidence": "closed"})["candidate_status"] == "likely_closed"
    assert classify({**osm, "site_type": "landfill", "landfill_closure_evidence": "mixed"})["candidate_status"] == "mixed"
    assert classify({**osm, "site_type": "landfill", "landfill_closure_evidence": None})["candidate_status"] == "status_unknown"
    assert classify({**osm, "site_type": "landfill", "landfill_closure_evidence": "not_closed"})["candidate_status"] == "status_unknown"
    assert classify({**osm, "site_type": "quarry", "osm_extraction_tags": True})["candidate_status"] == "likely_active"
    assert classify({**osm, "site_type": "quarry"})["candidate_status"] == "status_unknown"
    assert classify({**osm, "site_type": "quarry", "osm_lifecycle_inactive": True})["candidate_status"] == "likely_closed"
    assert classify({**osm, "site_type": "brownfield"})["screening_confidence"] == "low"
    assert classify({**deq, "has_existing_solar": True})["candidate_status"] == "existing_solar"
    for row in [deq, osm]:
        assert classify({**row, "site_type": "landfill"})["candidate_status"] in STATUSES


def test_landfill_closure_evidence():
    f = lambda progs, names: landfill_closure_evidence(pd.DataFrame({"Program": progs, "SiteName": names}))  # noqa
    pre, per = "NORTH CAROLINA PREREGULATORY LANDFILLS", "NORTH CAROLINA PERMITTED SOLID WASTE LANDFILLS"
    assert f([pre], ["X DUMP"]) == "closed"
    assert f([per], ["PITT COUNTY MSWLF (CLOSED 0500N)"]) == "closed"
    assert f([per, per], ["A (CLOSED)", "A PHASE 2"]) == "mixed"
    assert f([per], ["ENCLOSED SPACES LF"]) == "not_closed"  # word boundary, not substring
    assert landfill_closure_evidence(pd.DataFrame(columns=["Program", "SiteName"])) is None


# ---------------- scenario engine ----------------
def _sites():
    return pd.DataFrame({
        "site_id": list("abcdef"),
        "candidate_status": ["deq_brownfield_record"] * 4 + ["likely_active", "deq_brownfield_record"],
        "site_type": ["brownfield"] * 4 + ["quarry", "brownfield"],
        "usable_acres_slope10": [100.0, 20.0, 80.0, 60.0, 500.0, np.nan],
        "grid_line_distance_km": [2.0, 0.1, 0.5, 3.0, 0.0, 0.2],
        "usable_mean_slope_deg_slope10": [1.0, 0.5, 2.0, 3.0, 1.0, 1.0],
        "annual_mwh_per_mw_ac": [1750.0] * 6,
        "nwi_wetland_overlap_pct": [0.0, 1.0, np.nan, 5.0, 0.0, 0.0],
    })


def test_scenario_funnel_and_pareto():
    df = _sites()
    f, out, res = run_scenario(df, Scenario(target_mw_ac=10))  # needs 35.7 acres
    assert f == {"total": 6, "status_eligible": 5, "large_enough": 3, "screen_eligible": 3, "pareto_optimal": 2}
    o = out.set_index("site_id")
    assert not o.loc["b", "size_feasible"]          # 20 acres < 35.7
    assert not o.loc["f", "size_feasible"]          # missing usable area never counts as feasible
    assert o.loc["e", "status"] == "filtered"       # quarry not in the baseline brownfield scenario
    assert o.loc["d", "status"] == "dominated" and o.loc["d", "example_dominator"] in {"a", "c"}
    assert set(res.frontier.site_id) == {"a", "c"}
    assert o.loc["a", "target_annual_mwh"] == pytest.approx(17500)


def test_feasibility_boundary_is_inclusive():
    df = _sites()
    df.loc[0, "usable_acres_slope10"] = required_usable_acres(10)       # exactly enough
    df.loc[2, "usable_acres_slope10"] = required_usable_acres(10) - 1e-6
    _, out, _ = run_scenario(df, Scenario(target_mw_ac=10))
    o = out.set_index("site_id")
    assert o.loc["a", "size_feasible"] and not o.loc["c", "size_feasible"]


def test_scenario_nwi_cap_does_not_treat_missing_as_zero():
    f, out, _ = run_scenario(_sites(), Scenario(target_mw_ac=10, max_nwi_wetland_pct=2.0))
    o = out.set_index("site_id")
    assert not o.loc["c", "screen_eligible"]  # NWI missing -> fails an explicit NWI cap
    assert o.loc["a", "screen_eligible"]


def test_nwi_switch_uses_alternate_usable_column():
    df = _sites().assign(usable_acres_slope10_nwi_not_excluded=[100.0, 40.0, 80.0, 60.0, 500.0, np.nan])
    _, out, _ = run_scenario(df, Scenario(target_mw_ac=10, exclude_nwi=False))
    assert out.set_index("site_id").loc["b", "size_feasible"]   # 40 ac when NWI is not excluded


def test_terrain_metric_column_follows_threshold():
    assert terrain_metric_column(5) == "usable_mean_slope_deg_slope5"
    assert Scenario(slope_threshold_pct=15).resolved_objectives()[1][0] == "usable_mean_slope_deg_slope15"


# ---------------- raw loaders (skip if the manual downloads are absent) ----------------
def _have(p):
    return any((ROOT / "data" / "raw").glob(p))


@pytest.mark.skipif(not _have("NCBP_Feature_Poly_View_*"), reason="DEQ raw data not present")
def test_deq_loading_crs_validity_and_id_stability():
    from ingest_authoritative import read_deq_brownfields
    a = read_deq_brownfields()
    b = read_deq_brownfields()
    assert a.crs.to_epsg() == 32119
    assert a.BF_Number.is_unique and len(a) == 1363
    assert a.geometry.is_valid.all()                         # made valid
    assert (~a.deq_geometry_valid_in_source).sum() == 1      # source flaw recorded, not hidden
    assert list("DEQ-" + a.BF_Number) == list("DEQ-" + b.BF_Number)
    # polygon area agrees with the DEQ-reported acreage for the bulk of records
    ratio = (a.area / 4046.8564224) / a.BF_Acreage
    assert 0.95 < ratio.median() < 1.05


@pytest.mark.skipif(not _have("NC_geodatabase_wetlands"), reason="NWI raw data not present")
def test_nwi_masked_read_and_overlap():
    from ingest_authoritative import read_nwi
    # 1 km box around Lake Mattamuskeet shoreline (Hyde Co.) -> must contain NWI polygons
    m = box(-76.20, 35.48, -76.19, 35.49)
    w = read_nwi(m)
    assert len(w) > 0 and {"WETLAND_TYPE", "ATTRIBUTE"} <= set(w.columns)
    inter = w.to_crs(32119).intersection(gpd.GeoSeries([m], crs=4326).to_crs(32119).iloc[0]).area.sum()
    assert inter > 0


@pytest.mark.skipif(not (ROOT / "data/processed/feasibility_sites.parquet").exists(), reason="no processed data")
def test_processed_schema_missing_data_is_explicit():
    d = gpd.read_parquet(ROOT / "data/processed/feasibility_sites.parquet")
    assert d.site_id.is_unique
    assert d.fema_flood_overlap_pct.isna().all() and (d.fema_flood_data_status == "not_assessed").all()
    assert d.loc[d.nwi_data_status != "assessed", "nwi_wetland_overlap_pct"].isna().all()
    assert "eligible" not in d.columns and "is_pareto" not in d.columns  # scenario results not baked in
    for c in ["estimated_max_capacity_mw_ac", "estimated_max_capacity_mw_dc", "annual_mwh_per_mw_ac"]:
        assert c in d.columns
    # SolarSight capacity columns always carry an AC/DC suffix; the only bare "_mw" is EPA's own field
    assert [c for c in d.columns if "capacity" in c and c.endswith("_mw")] == ["epa_estimated_pv_capacity_mw"]
    pos = d.estimated_max_capacity_mw_ac > 0
    np.testing.assert_allclose(d.estimated_max_capacity_mw_dc[pos] / d.estimated_max_capacity_mw_ac[pos],
                               ASSUMPTIONS["dc_ac_ratio"])
    assert (d.estimated_max_capacity_mw_dc[~pos] == 0).all()
    assert d.crs.to_epsg() == 4326


# ---------------- tolerances (practical-significance option) ----------------
def test_tolerance_zero_equals_classical_and_within_tol_pairs_coexist():
    rng = np.random.default_rng(3)
    df = pd.DataFrame({"id": range(40), "x": rng.random(40), "y": rng.random(40)})
    objs = [("x", "min"), ("y", "min")]
    a = pareto_analysis(df, objs)
    b = pareto_analysis(df, objs, tolerances={"x": 0.0, "y": 0.0})
    assert set(a.frontier["id"]) == set(b.frontier["id"])
    pair = pd.DataFrame({"id": ["p", "q"], "x": [1.0, 1.1], "y": [1.0, 1.05]})
    assert len(pareto_analysis(pair, objs).frontier) == 1
    assert len(pareto_analysis(pair, objs, tolerances={"x": 0.2, "y": 0.2}).frontier) == 2
    with pytest.raises(ValueError):
        pareto_analysis(pair, objs, tolerances={"x": -1})


def test_explain_reports_within_tolerance_honestly():
    df = pd.DataFrame({"id": ["a", "b"], "km": [0.10, 0.05], "deg": [0.5, 2.0]})
    r = pareto_analysis(df, [("km", "min"), ("deg", "min")], tolerances={"km": 0.1})
    txt = r.explain("b", df)
    assert "dominated by a" in txt and "comparable km" in txt and "lower deg" in txt


# ---------------- EPA tabular vs geodatabase ----------------
@pytest.mark.skipif(not (ROOT / "data/raw/DataRecords.csv").exists() or not _have("re_powering_screening_geodatabase"),
                    reason="EPA raw data not present")
def test_epa_csv_matches_geodatabase_for_nc():
    from ingest_authoritative import read_epa_csv_nc, read_epa_nc
    c = read_epa_csv_nc()
    g = read_epa_nc()
    assert len(c) == len(g) == 6074
    c["Ref"] = c["Cross-Reference Number"].astype(int)
    m = g.merge(c, on="Ref")
    assert len(m) == 6074
    np.testing.assert_allclose(m.TransDist, pd.to_numeric(m["Distance to Nearest Transmission Line (miles)"]), atol=1e-3)
    np.testing.assert_allclose(m.Acreage, pd.to_numeric(m["Acreage (Acres)"]), atol=1e-3)
    est = pd.to_numeric(m["Estimated PV Capacity (MW)"])
    ok = m.EstPVCap.notna()
    np.testing.assert_allclose(m.EstPVCap[ok], est[ok], atol=0.006)          # CSV rounded to 2 dp
    sized = ok & (m.Acreage > 0) & (m.EstPVCap < 600)
    assert ((m.Acreage[sized] / m.EstPVCap[sized]).median()) == pytest.approx(6.9, abs=0.01)  # EPA 6.9 ac/MW


@pytest.mark.skipif(not (ROOT / "data/processed/deq_epa_match.parquet").exists(), reason="no processed data")
def test_deq_epa_match_table():
    m = gpd.read_parquet(ROOT / "data/processed/deq_epa_match.parquet")
    assert len(m) == 1363 and m.source_id.is_unique
    idm = m[m.epa_match_method == "id"]
    assert (idm.epa_site_id == idm.source_id).all() and (idm.epa_match_confidence == "high").all()
    # unmatched records are preserved, with no EPA values filled in
    un = m[m.epa_match_method == "unmatched"]
    assert len(un) > 0 and un.epa_transmission_distance_miles.isna().all() and un.epa_screening_acres.isna().all()
    amb = m[m.epa_match_method.str.startswith("ambiguous")]
    assert amb.epa_cross_reference_number.isna().all()


@pytest.mark.skipif(not (ROOT / "data/app/meta.json").exists(), reason="no app export")
def test_app_export_consistency():
    import json
    meta = json.loads((ROOT / "data/app/meta.json").read_text())
    g = gpd.read_file(ROOT / "data/app/candidates.geojson")
    assert len(g) == meta["n_candidates"]
    assert set(meta["fields"]) <= set(g.columns) | {"geometry"}
    epa_fields = [k for k, v in meta["fields"].items() if v["provenance"] == "epa_historical"]
    assert all(k.startswith("epa_") for k in epa_fields)
    assert (g.fema_flood_data_status == "not_assessed").all() and g.fema_flood_overlap_pct.isna().all()
