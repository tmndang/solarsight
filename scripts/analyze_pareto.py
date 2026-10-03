"""Exploratory Pareto analysis on the real feasibility dataset.

Outputs
  data/processed/pareto_results.parquet   long table: model x site status/rank/dominator
  docs/analysis/pareto_report.md          numbers quoted in DATA_FEASIBILITY.md
  docs/analysis/*.png                     validation figures
"""
import json

import geopandas as gpd
import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from _common import ROOT, RAW, PROCESSED  # noqa: E402
from src.analysis.pareto import Objective, knee_point, pareto_analysis, tradeoff_ladder  # noqa: E402

OUT = ROOT / "docs" / "analysis"
OUT.mkdir(parents=True, exist_ok=True)

MODELS = {
    "A: MWh / grid line / mean slope": [("estimated_annual_mwh", "max"), ("grid_line_distance_km", "min"),
                                        ("mean_slope_deg", "min")],
    "B: MWh / grid line (slope as constraint)": [("estimated_annual_mwh", "max"), ("grid_line_distance_km", "min")],
    "B': MWh / substation (slope as constraint)": [("estimated_annual_mwh", "max"), ("substation_distance_km", "min")],
    "C: usable acres / grid line / water overlap": [("usable_area_acres", "max"), ("grid_line_distance_km", "min"),
                                                    ("water_overlap_pct", "min")],
    "D: MWh / grid line / road": [("estimated_annual_mwh", "max"), ("grid_line_distance_km", "min"),
                                  ("road_distance_km", "min")],
    "E: MWh / grid line / MWh-per-acre": [("estimated_annual_mwh", "max"), ("grid_line_distance_km", "min"),
                                          ("mwh_per_usable_acre", "max")],
    "F: MWh / grid line / substation": [("estimated_annual_mwh", "max"), ("grid_line_distance_km", "min"),
                                        ("substation_distance_km", "min")],
    "A': MWh / grid line / slope of usable land": [("estimated_annual_mwh", "max"), ("grid_line_distance_km", "min"),
                                                   ("usable_mean_slope_deg", "min")],
}
# Within a project-size band, size stops being the objective and becomes the scenario.
BAND_OBJS = [("estimated_annual_mwh", "max"), ("grid_line_distance_km", "min"), ("mean_slope_deg", "min")]
BANDS = [(2.8, 10), (10, 40), (40, 150), (150, 1e9)]  # estimated MWac
LABELS = {"estimated_annual_mwh": "estimated annual generation (MWh/yr)",
          "grid_line_distance_km": "distance to mapped >=69 kV line (km)",
          "substation_distance_km": "distance to mapped >=69 kV substation (km)",
          "mean_slope_deg": "mean slope (deg)", "road_distance_km": "distance to road (km)"}
FMT = {"estimated_annual_mwh": "{:,.0f}", "grid_line_distance_km": "{:.2f}",
       "substation_distance_km": "{:.2f}", "mean_slope_deg": "{:.1f}"}


def md_table(df, floatfmt="{:.2f}"):
    cols = list(df.columns)
    lines = ["| " + " | ".join(map(str, cols)) + " |", "|" + "---|" * len(cols)]
    for _, r in df.iterrows():
        lines.append("| " + " | ".join(floatfmt.format(v) if isinstance(v, (float, np.floating)) else str(v)
                                       for v in r.values) + " |")
    return "\n".join(lines)


def main():
    d = gpd.read_parquet(PROCESSED / "feasibility_sites.parquet")
    e = d[d.eligible].copy()
    rep = ["# Pareto analysis on real NC candidates (auto-generated)\n"]
    rep.append(f"Candidates: {len(d)}; eligible after hard constraints: {len(e)} "
               f"(usable area < 10 ac: {int(d.fails_min_usable_area.sum())}, "
               f"existing solar on site: {int(d.has_existing_solar.sum())}).\n")
    rep.append("Eligible by type: " + json.dumps(e.candidate_type.value_counts().to_dict()) + "\n")

    # ---- distributions ---------------------------------------------------------------
    cols = ["gross_area_acres", "usable_area_acres", "usable_fraction", "estimated_capacity_mwac",
            "estimated_annual_mwh", "kwh_per_kwdc", "mwh_per_usable_acre", "grid_line_distance_km",
            "substation_distance_km", "road_distance_km", "mean_slope_deg", "p90_slope_deg",
            "usable_mean_slope_deg", "water_overlap_pct", "osm_wetland_overlap_pct"]
    desc = e[cols].describe(percentiles=[.1, .5, .9]).T[["min", "10%", "50%", "90%", "max", "mean", "std"]]
    desc["cv"] = desc["std"] / desc["mean"]
    rep.append("## Distributions (eligible)\n\n" + md_table(desc.reset_index().rename(columns={"index": "metric"})))

    # ---- energy vs acreage ------------------------------------------------------------
    r_log = np.corrcoef(np.log(e.estimated_annual_mwh), np.log(e.usable_area_acres))[0, 1]
    spec_cv = e.kwh_per_kwdc.std() / e.kwh_per_kwdc.mean()
    share = np.var(np.log(e.kwh_per_kwdc)) / np.var(np.log(e.estimated_annual_mwh))
    rep.append(f"\n## Is annual MWh just acreage?\n\n"
               f"- Pearson r(log MWh, log usable acres) = {r_log:.4f} (R^2 = {r_log**2:.4f})\n"
               f"- Specific yield kWh/kWdc: min {e.kwh_per_kwdc.min():.0f}, max {e.kwh_per_kwdc.max():.0f}, "
               f"CV {spec_cv:.3%}\n"
               f"- Share of variance of log(MWh) explained by site solar resource: {share:.3%}\n")

    # ---- correlations -----------------------------------------------------------------
    cc = ["estimated_annual_mwh", "usable_area_acres", "kwh_per_kwdc", "grid_line_distance_km",
          "substation_distance_km", "road_distance_km", "mean_slope_deg", "p90_slope_deg", "water_overlap_pct"]
    sp = e[cc].corr(method="spearman")
    sp.to_csv(OUT / "spearman_eligible.csv")
    rep.append("## Spearman correlations (eligible)\n\n" + md_table(sp.reset_index().rename(columns={"index": ""})))

    # ---- models -----------------------------------------------------------------------
    rows, long = [], []
    for name, objs in MODELS.items():
        r = pareto_analysis(e, objs, id_col="site_id")
        f = r.frontier
        rows.append({"model": name, "n_eligible": len(e), "frontier": len(f),
                     "frontier_pct": 100 * len(f) / len(e),
                     "frontier_types": json.dumps(e.set_index("site_id").loc[f.site_id].candidate_type
                                                  .value_counts().to_dict()),
                     "max_rank": int(r.table.pareto_rank.max())})
        t = r.table.copy()
        t["model"] = name
        long.append(t)
    mt = pd.DataFrame(rows)
    rep.append("\n## Objective-set comparison\n\n" + md_table(mt, "{:.1f}"))
    pd.concat(long).to_parquet(PROCESSED / "pareto_results.parquet", index=False)

    # ---- size-band scenarios ---------------------------------------------------------
    rows = []
    for lo, hi in BANDS:
        for pop_name, pop in [("all eligible", e),
                              ("conservative", e[(e.candidate_type != "quarry")
                                                 | (e.osm_status_hint == "tagged_inactive_or_former")])]:
            s = pop[(pop.estimated_capacity_mwac >= lo) & (pop.estimated_capacity_mwac < hi)]
            if len(s) == 0:
                continue
            r = pareto_analysis(s, BAND_OBJS, id_col="site_id")
            ids = r.frontier.site_id.tolist()
            rows.append({"band_mwac": f"{lo:g}-{hi:g}" if hi < 1e8 else f">={lo:g}", "population": pop_name,
                         "n": len(s), "frontier": len(ids), "frontier_pct": 100 * len(ids) / len(s),
                         "spearman_mwh_vs_grid": s.estimated_annual_mwh.corr(s.grid_line_distance_km, "spearman"),
                         "frontier_sites": ", ".join(ids)})
    rep.append("\n## Size-band scenarios (objectives: MWh max, grid line km min, mean slope min)\n\n"
               + md_table(pd.DataFrame(rows), "{:.2f}"))

    # ---- candidate-population scenario: quarries are mostly operating aggregate pits ----
    cons = e[(e.candidate_type != "quarry") | (e.osm_status_hint == "tagged_inactive_or_former")]
    rows = []
    for name, objs in MODELS.items():
        r = pareto_analysis(cons, objs, id_col="site_id")
        rows.append({"model": name, "n_eligible": len(cons), "frontier": len(r.frontier),
                     "frontier_pct": 100 * len(r.frontier) / len(cons)})
    rep.append("\n## Conservative population (landfills + brownfields + quarries tagged inactive)\n\n"
               + md_table(pd.DataFrame(rows), "{:.1f}"))

    # ---- slope-threshold sensitivity for model B --------------------------------------
    sens = []
    base = pareto_analysis(e, MODELS["B: MWh / grid line (slope as constraint)"], id_col="site_id")
    base_front = set(base.frontier.site_id)
    for s in (5, 10, 15):
        x = d.copy()
        x["estimated_annual_mwh"] = x[f"estimated_annual_mwh_slope{s}"]
        el = (x[f"usable_acres_slope{s}"] >= 10) & ~x.has_existing_solar
        r = pareto_analysis(x, MODELS["B: MWh / grid line (slope as constraint)"], id_col="site_id", eligible=el)
        fr = set(r.frontier.site_id)
        sens.append({"slope_threshold_pct": s, "eligible": int(el.sum()), "frontier": len(fr),
                     "jaccard_vs_10pct": len(fr & base_front) / len(fr | base_front)})
    rep.append("\n## Slope-threshold sensitivity (model B)\n\n" + md_table(pd.DataFrame(sens), "{:.2f}"))

    # ---- grid distance validation -----------------------------------------------------
    val = pd.read_parquet(PROCESSED / "grid_proxy_validation.parquet")
    q = val.groupby(pd.cut(val.capacity_mw, [0, 5.01, 20, 1000], labels=["1-5 MWac", "5-20 MWac", ">20 MWac"]),
                    observed=True)[["grid_line_distance_km", "substation_distance_km"]] \
        .quantile([.5, .9]).unstack().round(2)
    q.columns = [f"{a} p{int(b*100)}" for a, b in q.columns]
    rep.append("\n## Yardstick: operating NC PV plants (EIA-860) to the same mapped grid layers\n\n"
               + md_table(q.reset_index().rename(columns={"capacity_mw": "plant size"})))
    cand_q = e[["grid_line_distance_km", "substation_distance_km"]].quantile([.5, .9]).round(2)
    rep.append("\nEligible candidates: line p50/p90 = "
               f"{cand_q.grid_line_distance_km.iloc[0]}/{cand_q.grid_line_distance_km.iloc[1]} km; "
               f"substation p50/p90 = {cand_q.substation_distance_km.iloc[0]}/{cand_q.substation_distance_km.iloc[1]} km\n")

    # ---- model B frontier listing, ladder, knee stability -----------------------------
    b = base
    fb = e.set_index("site_id").loc[b.frontier.site_id].reset_index()
    lad = tradeoff_ladder(fb, Objective("estimated_annual_mwh", "max"), Objective("grid_line_distance_km", "min"))
    kr = knee_point(lad, MODELS["B: MWh / grid line (slope as constraint)"], "range")
    kk = knee_point(lad, MODELS["B: MWh / grid line (slope as constraint)"], "rank")
    lad["knee_range"], lad["knee_rank"] = kr.round(3), kk.round(3)
    # log-scaled energy is another defensible rescaling
    lg = lad.assign(estimated_annual_mwh=np.log(lad.estimated_annual_mwh))
    lad["knee_logrange"] = knee_point(lg, MODELS["B: MWh / grid line (slope as constraint)"], "range").round(3)
    show = lad[["site_id", "name", "candidate_type", "county", "usable_area_acres", "estimated_capacity_mwac",
                "estimated_annual_mwh", "grid_line_distance_km", "substation_distance_km", "mean_slope_deg",
                "rate_grid_line_distance_km_per_estimated_annual_mwh", "knee_range", "knee_rank", "knee_logrange"]]
    show = show.assign(mwh_gained_per_extra_km=1 / show.rate_grid_line_distance_km_per_estimated_annual_mwh) \
        .drop(columns="rate_grid_line_distance_km_per_estimated_annual_mwh")
    rep.append("\n## Model B frontier (sorted by energy) with tradeoff ladder and knee scores\n\n"
               + md_table(show, "{:,.2f}"))
    knees = {t: show.loc[show[t].idxmax(), "site_id"] if show[t].notna().any() else None
             for t in ("knee_range", "knee_rank", "knee_logrange")}
    rep.append(f"\nKnee by rescaling: {json.dumps(knees)}\n")

    # model A frontier listing
    a = pareto_analysis(e, MODELS["A: MWh / grid line / mean slope"], id_col="site_id")
    fa = e.set_index("site_id").loc[a.frontier.site_id].reset_index().sort_values("estimated_annual_mwh",
                                                                                     ascending=False)
    rep.append("\n## Model A frontier\n\n" + md_table(fa[["site_id", "name", "candidate_type", "usable_area_acres",
                                                          "estimated_annual_mwh", "grid_line_distance_km",
                                                          "mean_slope_deg"]], "{:,.2f}"))
    # explanations
    rep.append("\n## Example dominance explanations (model A)\n")
    dom = a.dominated.sort_values("n_dominators").head(5)
    for sid in dom.site_id:
        rep.append("- " + a.explain(sid, e, labels=LABELS, fmt=FMT))

    rep.append(pv_validation(e))
    (OUT / "pareto_report.md").write_text("\n".join(rep) + "\n")
    print("\n".join(rep))
    figures(d, e, base, a)


def pv_validation(e):
    """PVWatts (same assumptions, plant's own tilt and DC/AC) vs observed EIA-923 capacity factor,
    for NC fixed-tilt PV plants whose nearest NSRDB pixel is already cached."""
    from scipy.spatial import cKDTree
    from src.analysis.assumptions import ASSUMPTIONS
    from src.analysis.pv import nsrdb_to_sam, specific_yield

    g = pd.read_parquet(RAW / "eia_nc_solar_generators.parquet")
    g["year"] = pd.to_datetime(g.report_date).dt.year
    obs = g[g.year.isin([2023, 2024]) & (g.capacity_mw >= 1) & (g.capacity_factor > 0.05)
            & (g.uses_technology_fixed_tilt.fillna(False).astype(bool))
            & ~g.uses_technology_single_axis_tracking.fillna(False).astype(bool)]
    obs = obs.groupby("plant_id_eia").agg(cf=("capacity_factor", "mean"), lat=("latitude", "first"),
                                          lon=("longitude", "first"), tilt=("tilt_angle_deg", "median"),
                                          mwac=("capacity_mw", "sum"), mwdc=("net_capacity_mwdc", "sum")).dropna()
    meta = pd.read_parquet(RAW / "nsrdb_meta_nc.parquet")
    dist, idx = cKDTree(np.c_[meta.longitude, meta.latitude]).query(np.c_[obs.lon, obs.lat])
    obs["gid"] = meta.gid.values[idx]
    obs = obs[[(RAW / "nsrdb_tmy" / f"{x}.parquet").exists() for x in obs.gid] & (dist < 0.03)]
    obs = obs[(obs.tilt > 5) & (obs.tilt < 45) & (obs.mwdc / obs.mwac).between(1.0, 1.6)]
    mod = []
    for r in obs.itertuples():
        a = dict(ASSUMPTIONS, tilt_deg=float(r.tilt), dc_ac_ratio=float(r.mwdc / r.mwac))
        mod.append(specific_yield(nsrdb_to_sam(pd.read_parquet(RAW / "nsrdb_tmy" / f"{r.gid}.parquet")), a)
                   ["ac_capacity_factor"])
    obs["cf_model"] = mod
    obs["ratio"] = obs.cf_model / obs.cf
    obs.to_csv(OUT / "pv_validation_eia.csv")
    return ("\n## PVWatts vs observed EIA-923 capacity factor (NC fixed-tilt PV, 2023-24 mean)\n\n"
            f"Plants matched to a cached NSRDB pixel: {len(obs)}. Observed AC CF median {obs.cf.median():.3f}; "
            f"modelled median {obs.cf_model.median():.3f}; modelled/observed ratio median "
            f"{obs.ratio.median():.3f} (p10 {obs.ratio.quantile(.1):.3f}, p90 {obs.ratio.quantile(.9):.3f}). "
            f"Pearson r across plants {obs.cf.corr(obs.cf_model):.2f}.\n"
            f"Candidate modelled AC CF (default assumptions): median {e.ac_capacity_factor.median():.3f}, "
            f"range {e.ac_capacity_factor.min():.3f}-{e.ac_capacity_factor.max():.3f}.\n")


def figures(d, e, b, a):
    colors = {"landfill": "#1b7837", "quarry": "#762a83", "brownfield": "#e08214"}
    fig, axes = plt.subplots(1, 3, figsize=(17, 5))
    ax = axes[0]
    for t, g in e.groupby("candidate_type"):
        ax.scatter(g.grid_line_distance_km, g.estimated_annual_mwh, s=14, alpha=.6, c=colors[t], label=t)
    fb = e.set_index("site_id").loc[b.frontier.site_id].sort_values("grid_line_distance_km")
    ax.step(fb.grid_line_distance_km, fb.estimated_annual_mwh, where="post", c="k", lw=1)
    ax.scatter(fb.grid_line_distance_km, fb.estimated_annual_mwh, s=40, facecolors="none", edgecolors="k",
               label="Pareto (model B)")
    ax.set_yscale("log"); ax.set_xlabel("distance to mapped >=69 kV line (km)")
    ax.set_ylabel("estimated annual MWh (log)"); ax.legend(fontsize=8); ax.set_title("Model B frontier")
    ax = axes[1]
    ax.scatter(e.usable_area_acres, e.estimated_annual_mwh, s=10, c="#444")
    ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlabel("usable acres"); ax.set_ylabel("annual MWh")
    ax.set_title("Energy is ~ proportional to usable acreage")
    ax = axes[2]
    for t, g in d.groupby("candidate_type"):
        ax.hist(g.mean_slope_deg, bins=30, alpha=.5, color=colors[t], label=t)
    ax.set_xlabel("mean slope over candidate polygon (deg)"); ax.legend(); ax.set_title("Disturbed land is not flat")
    fig.tight_layout(); fig.savefig(OUT / "pareto_overview.png", dpi=110)

    # map
    nc = gpd.read_parquet(RAW / "nc_boundary.parquet")
    nc = nc[nc["class"] == "land"]
    fig, ax = plt.subplots(figsize=(13, 6))
    nc.boundary.plot(ax=ax, color="#999", lw=.6)
    pts = d.copy(); pts["geometry"] = gpd.points_from_xy(pts.longitude, pts.latitude)
    pts[~pts.eligible].plot(ax=ax, color="#bbb", markersize=6, label="not eligible")
    el = pts[pts.eligible]
    for t, g in el.groupby("candidate_type"):
        g.plot(ax=ax, color=colors[t], markersize=10, label=t)
    fa = el[el.site_id.isin(a.frontier.site_id)]
    fa.plot(ax=ax, facecolor="none", edgecolor="k", markersize=60, label="Pareto (model A)")
    ax.legend(fontsize=8, loc="lower left"); ax.set_title("SolarSight feasibility candidates (OSM disturbed land, NC)")
    ax.set_axis_off(); fig.tight_layout(); fig.savefig(OUT / "candidate_map.png", dpi=110)


if __name__ == "__main__":
    main()
