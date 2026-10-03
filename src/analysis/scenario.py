"""Scenario engine: target project size -> funnel -> Pareto (no weights, no composite score).

A scenario is everything a planner chooses; nothing here is stored in the canonical dataset.

    total candidates
      -> status-eligible      (candidate_status in scenario.statuses, site_type in scenario.site_types)
      -> large enough         (usable acres at the chosen slope threshold [NWI excluded or not] >= required acres)
      -> screen-eligible      (objective metrics present; optional user caps: max grid km, max NWI %)
      -> Pareto-optimal       (minimise each objective; src/analysis/pareto.py)
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .assumptions import ASSUMPTIONS, required_usable_acres
from .pareto import pareto_analysis
from .status import DEFAULT_ELIGIBLE_STATUSES

DEFAULT_SITE_TYPES = ["brownfield"]


def terrain_metric_column(slope_threshold_pct: float) -> str:
    """Frozen terrain objective: mean slope (deg) over the usable area at the chosen threshold."""
    return f"usable_mean_slope_deg_slope{int(slope_threshold_pct)}"


@dataclass
class Scenario:
    target_mw_ac: float = 10.0
    slope_threshold_pct: float = ASSUMPTIONS["slope_exclusion_pct"]
    statuses: list = field(default_factory=lambda: list(DEFAULT_ELIGIBLE_STATUSES))
    site_types: list = field(default_factory=lambda: list(DEFAULT_SITE_TYPES))
    max_grid_line_km: float | None = None
    max_nwi_wetland_pct: float | None = None
    exclude_nwi: bool = ASSUMPTIONS["exclude_nwi_wetlands_from_usable"]
    tolerances: dict | None = None  # optional practical-significance tolerances (raw units); default strict
    objectives: list | None = None  # default: grid line distance + terrain metric, both minimised

    def resolved_objectives(self):
        return self.objectives or [("grid_line_distance_km", "minimize"),
                                   (terrain_metric_column(self.slope_threshold_pct), "minimize")]


def run_scenario(df: pd.DataFrame, sc: Scenario, id_col: str = "site_id"):
    """Return (funnel dict, per-site table with stage flags + Pareto columns, ParetoResult)."""
    t = int(sc.slope_threshold_pct)
    req = required_usable_acres(sc.target_mw_ac)
    usable = df[f"usable_acres_slope{t}" + ("" if sc.exclude_nwi else "_nwi_not_excluded")]
    s_status = df.candidate_status.isin(sc.statuses) & df.site_type.isin(sc.site_types)
    s_size = s_status & (usable >= req)
    objs = sc.resolved_objectives()
    complete = np.ones(len(df), bool)
    for name, _ in objs:
        complete &= df[name].notna().to_numpy()
    s_screen = s_size & complete
    if sc.max_grid_line_km is not None:
        s_screen &= df.grid_line_distance_km <= sc.max_grid_line_km
    if sc.max_nwi_wetland_pct is not None:
        # missing NWI is NOT treated as zero: a site without NWI coverage fails an NWI cap
        s_screen &= df.nwi_wetland_overlap_pct.notna() & (df.nwi_wetland_overlap_pct <= sc.max_nwi_wetland_pct)
    res = pareto_analysis(df, objs, id_col=id_col, eligible=s_screen.to_numpy(), tolerances=sc.tolerances)
    out = df[[id_col]].copy()
    out["status_eligible"] = s_status.to_numpy()
    out["size_feasible"] = (usable >= req).to_numpy()
    out["screen_eligible"] = s_screen.to_numpy()
    out = out.merge(res.table, on=id_col)
    out["target_mw_ac"] = sc.target_mw_ac
    out["required_usable_acres"] = req
    out["target_annual_mwh"] = sc.target_mw_ac * df["annual_mwh_per_mw_ac"].to_numpy()
    funnel = {"total": int(len(df)), "status_eligible": int(s_status.sum()), "large_enough": int(s_size.sum()),
              "screen_eligible": int(s_screen.sum()), "pareto_optimal": int(len(res.frontier))}
    return funnel, out, res
