"""Golden scenario results from the frozen Python engine, for testing the frontend port.

For every combination of scenario x target MW AC x slope rule x NWI switch, records the funnel
counts, the Pareto rank of each screen-eligible site and its example dominator. The TypeScript
implementation of src/analysis/scenario.py + pareto.py must reproduce this file exactly.

Output: data/app/fixtures/scenario_expected.json (test-only; not loaded by the app at runtime)
"""
import json

import geopandas as gpd

from _common import ROOT, PROCESSED
from src.analysis.scenario import Scenario, run_scenario
from src.analysis.status import DEFAULT_ELIGIBLE_STATUSES, LANDFILL_SCENARIO_STATUSES

SCENARIOS = {
    "brownfields_baseline": (["brownfield"], DEFAULT_ELIGIBLE_STATUSES, "nc_deq_brownfields"),
    "landfills_secondary": (["landfill"], LANDFILL_SCENARIO_STATUSES, "osm_overture"),
    "quarries_exploratory": (["quarry"], ["likely_closed"], "osm_overture"),
}


def main():
    d = gpd.read_parquet(PROCESSED / "feasibility_sites.parquet")
    cases = []
    for name, (types, statuses, src) in SCENARIOS.items():
        universe = int(((d.site_type.isin(types)) & (d.primary_source == src)).sum())
        for t in (5.0, 10.0, 20.0, 40.0):
            for s in (5.0, 10.0, 15.0):
                for nwi in (True, False):
                    f, o, r = run_scenario(d, Scenario(target_mw_ac=t, slope_threshold_pct=s, exclude_nwi=nwi,
                                                       statuses=statuses, site_types=types))
                    e = o[o.screen_eligible]
                    cases.append({
                        "scenario": name, "target_mw_ac": t, "slope_threshold_pct": s, "exclude_nwi": nwi,
                        "funnel": {"universe": universe, "baseline": f["status_eligible"],
                                   "size_feasible": f["large_enough"], "screen_eligible": f["screen_eligible"],
                                   "frontier": f["pareto_optimal"]},
                        "ranks": {sid: int(rk) for sid, rk in zip(e.site_id, e.pareto_rank)},
                        "example_dominator": {sid: dm for sid, dm in zip(e.site_id, e.example_dominator)
                                              if isinstance(dm, str)},  # NaN (no dominator) is truthy
                    })
    out = ROOT / "data" / "app" / "fixtures"
    out.mkdir(parents=True, exist_ok=True)
    (out / "scenario_expected.json").write_text(json.dumps({"cases": cases}, indent=0, allow_nan=False))
    print(f"{len(cases)} scenario cases written")


if __name__ == "__main__":
    main()
