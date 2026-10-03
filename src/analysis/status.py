"""Candidate status / screening-confidence rules (frozen for the app).

Status describes what the evidence says about the land's current condition; confidence describes
how much we trust the record (geometry + identity + status evidence). Neither ever means
"available for solar". Rules use recorded evidence only; absent evidence -> `status_unknown`.

candidate_status
  deq_brownfield_record  NC DEQ Brownfields Program project polygon. The DEQ `Status` value
                         (Recorded, Active Eligible, No Further Interest, ...) is carried verbatim in
                         `deq_status` and NOT interpreted, because no field documentation came with
                         the download.
  likely_closed          landfill/quarry with documentary closure evidence: every matched EPA
                         RE-Powering NC landfill record is pre-regulatory or named "CLOSED", or an
                         OSM abandoned/disused/former tag
  mixed                  landfill footprint matched to both closed and not-closed permitted units
  likely_active          quarry/mine with OSM operator/resource/mine tags and no lifecycle tag
  status_unknown         no reliable evidence
  likely_built_out       >= BUILT_OUT_PCT of the footprint covered by building footprints (overrides)
  existing_solar         solar already mapped (OSM) or registered (EIA-860) on the site (overrides)

screening_confidence
  high    DEQ polygon whose project ID is also in EPA RE-Powering (two authoritative sources agree)
  medium  DEQ polygon without EPA match; landfill with EPA permit-record evidence
  low     OpenStreetMap-only evidence
"""
from __future__ import annotations

import pandas as pd

BUILT_OUT_PCT = 25.0
STATUSES = ["deq_brownfield_record", "likely_closed", "mixed", "status_unknown", "likely_active",
            "likely_built_out", "existing_solar"]
DEFAULT_ELIGIBLE_STATUSES = ["deq_brownfield_record"]          # baseline brownfields scenario
LANDFILL_SCENARIO_STATUSES = ["likely_closed", "mixed"]          # secondary scenario


def classify(row: pd.Series | dict) -> dict:
    """row keys used: site_type, primary_source, deq_status, epa_match_method, building_coverage_pct,
    landfill_closure_evidence ('closed'|'mixed'|'not_closed'|None), osm_lifecycle_inactive,
    osm_extraction_tags, has_existing_solar."""
    r = dict(row)
    t, src = r.get("site_type"), r.get("primary_source")
    bcov = r.get("building_coverage_pct")
    b_known = bcov is not None and not pd.isna(bcov)
    deq = src == "nc_deq_brownfields"
    if deq:
        conf = "high" if r.get("epa_match_method") == "id" else "medium"
    elif t == "landfill" and r.get("landfill_closure_evidence") is not None:
        conf = "medium"
    else:
        conf = "low"
    if r.get("has_existing_solar"):
        return _out("existing_solar", conf, "OSM solar polygons / EIA-860",
                    "solar generation already mapped or registered on the site")
    if b_known and bcov >= BUILT_OUT_PCT:
        return _out("likely_built_out", conf, "Overture building footprints",
                    f"{bcov:.0f}% of the footprint is covered by buildings (>= {BUILT_OUT_PCT:.0f}%)")
    bnote = "" if b_known else "; building coverage not assessed"
    if deq:
        return _out("deq_brownfield_record", conf, "NC DEQ Brownfields Program",
                    f"DEQ Brownfields project polygon, DEQ Status='{r.get('deq_status')}' (not interpreted)" + bnote)
    if t == "landfill":
        ev = r.get("landfill_closure_evidence")
        if ev == "closed":
            return _out("likely_closed", conf, "EPA RE-Powering (NC landfill program lists)",
                        "all matched landfill records are pre-regulatory or named CLOSED" + bnote)
        if ev == "mixed":
            return _out("mixed", conf, "EPA RE-Powering (NC landfill program lists)",
                        "footprint matches closed and not-closed permitted units; cell-level status unknown")
        if r.get("osm_lifecycle_inactive"):
            return _out("likely_closed", conf, "OpenStreetMap", "OSM abandoned/disused/former tag" + bnote)
        if ev == "not_closed":
            return _out("status_unknown", conf, "EPA RE-Powering (NC landfill program lists)",
                        "matched permitted unit(s) without closure evidence; may be operating")
        return _out("status_unknown", conf, "OpenStreetMap", "no landfill permit record matched")
    if t == "quarry":
        if r.get("osm_lifecycle_inactive"):
            return _out("likely_closed", conf, "OpenStreetMap", "OSM abandoned/disused/former tag")
        if r.get("osm_extraction_tags"):
            return _out("likely_active", conf, "OpenStreetMap",
                        "quarry/mine with operator/resource/mine tags and no lifecycle tag")
        return _out("status_unknown", conf, "OpenStreetMap", "quarry footprint without lifecycle or operator tags")
    if t == "brownfield":
        return _out("status_unknown", conf, "OpenStreetMap",
                    "OSM landuse=brownfield, not an NC DEQ Brownfields record" + bnote)
    return _out("status_unknown", conf, str(src), "no rule")


def _out(status, conf, source, reason):
    assert status in STATUSES
    return {"candidate_status": status, "screening_confidence": conf, "status_source": source,
            "status_reason": reason}


def landfill_closure_evidence(records: pd.DataFrame) -> str | None:
    """records: EPA NC landfill points matched to one footprint (columns Program, SiteName)."""
    if records is None or len(records) == 0:
        return None
    closed = (records["Program"].eq("NORTH CAROLINA PREREGULATORY LANDFILLS")
              | records["SiteName"].fillna("").str.upper().str.contains(r"\bCLOSED\b"))
    if closed.all():
        return "closed"
    if closed.any():
        return "mixed"
    return "not_closed"
