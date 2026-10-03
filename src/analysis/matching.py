"""Deterministic record matching between authoritative datasets (no fuzzy matching).

Order of evidence, strongest first:
  1. explicit identifier equality                      -> confidence "high"
  2. exact normalised name + normalised street address -> "medium"
  3. exact normalised name + same city                 -> "medium"
  4. exact normalised street address + same city       -> "medium"
  5. point inside polygon (or within `tol_m`), unique  -> "low"  (proximity only)
A rule only produces a match when it yields exactly ONE counterpart. Several counterparts are
recorded as ambiguous (`match_method="ambiguous_<rule>"`, no id chosen). Nothing is guessed.
"""
from __future__ import annotations

import re

import geopandas as gpd
import pandas as pd

_ABBR = {"STREET": "ST", "ROAD": "RD", "AVENUE": "AVE", "DRIVE": "DR", "BOULEVARD": "BLVD",
         "HIGHWAY": "HWY", "LANE": "LN", "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
         "COMPANY": "CO", "INCORPORATED": "INC", "CORPORATION": "CORP", "PROPERTY": "PROP",
         "PROPERTIES": "PROP", "FORMER": "", "THE": ""}


def norm_text(s) -> str | None:
    """Upper-case, strip punctuation, expand/abbreviate common tokens. None for blank."""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return None
    t = re.sub(r"[^A-Z0-9 ]", " ", str(s).upper())
    toks = [_ABBR.get(w, w) for w in t.split()]
    out = " ".join(w for w in toks if w)
    return out or None


def _unique_lookup(keys_left: pd.Series, keys_right: pd.Series, ids_right: pd.Series):
    """For each left key: the single right id with the same key, or a list if ambiguous."""
    grp = pd.DataFrame({"k": keys_right.values, "id": ids_right.values}).dropna(subset=["k"])
    m = grp.groupby("k")["id"].apply(list)
    return keys_left.map(lambda k: m.get(k) if k is not None else None)


def match_records(left: pd.DataFrame, right: pd.DataFrame, *, left_id: str, right_id: str,
                  id_pairs: tuple[str, str] | None = None,
                  name_cols: tuple[str, str] | None = None,
                  addr_cols: tuple[str, str] | None = None,
                  city_cols: tuple[str, str] | None = None,
                  spatial: bool = False, tol_m: float = 0.0, metric_crs: str = "EPSG:32119") -> pd.DataFrame:
    """Return one row per left record: matched right id (or None), method, confidence, n_candidates."""
    out = pd.DataFrame({left_id: left[left_id].values, "match_id": None, "match_method": None,
                        "match_confidence": None, "match_n_candidates": 0}, index=left.index)
    used_right: set = set()

    def apply(rule, found, conf):
        for i, cand in found.items():
            if out.at[i, "match_id"] is not None or (out.at[i, "match_method"] or "").startswith("ambiguous"):
                continue
            if not cand:
                continue
            cand = [c for c in cand if c not in used_right] if rule != "id" else cand
            if len(cand) == 1:
                out.at[i, "match_id"], out.at[i, "match_method"] = cand[0], rule
                out.at[i, "match_confidence"], out.at[i, "match_n_candidates"] = conf, 1
                used_right.add(cand[0])
            elif len(cand) > 1:
                out.at[i, "match_method"] = f"ambiguous_{rule}"
                out.at[i, "match_n_candidates"] = len(cand)

    if id_pairs:
        lk = left[id_pairs[0]].astype(str).str.strip()
        rk = right[id_pairs[1]].astype(str).str.strip()
        apply("id", _unique_lookup(lk, rk, right[right_id]), "high")
    city = (left[city_cols[0]].map(norm_text), right[city_cols[1]].map(norm_text)) if city_cols else None
    if name_cols and addr_cols:
        lk = left[name_cols[0]].map(norm_text) + "|" + left[addr_cols[0]].map(norm_text)
        rk = right[name_cols[1]].map(norm_text) + "|" + right[addr_cols[1]].map(norm_text)
        apply("name_address", _unique_lookup(lk, rk, right[right_id]), "medium")
    for rule, cols in (("name_city", name_cols), ("address_city", addr_cols)):
        if not cols:
            continue
        lk = left[cols[0]].map(norm_text)
        rk = right[cols[1]].map(norm_text)
        if city is not None:
            lk = lk.where(lk.isna(), lk + "|" + city[0].fillna(""))
            rk = rk.where(rk.isna(), rk + "|" + city[1].fillna(""))
        apply(rule, _unique_lookup(lk, rk, right[right_id]), "medium")
    if spatial:
        lg = gpd.GeoDataFrame(left[[left_id]], geometry=left.geometry, crs=left.crs).to_crs(metric_crs)
        rg = gpd.GeoDataFrame(right[[right_id]], geometry=right.geometry, crs=right.crs).to_crs(metric_crs)
        geoms = lg.geometry.buffer(tol_m) if tol_m else lg.geometry
        li, ri = rg.sindex.query(geoms.values, predicate="intersects")
        found = pd.Series([[] for _ in range(len(lg))], index=lg.index, dtype=object)
        for a, b in zip(li, ri):
            found.iloc[a].append(rg[right_id].iloc[b])
        apply("spatial", found, "low")
    return out
