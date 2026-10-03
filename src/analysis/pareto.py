"""Generic Pareto-dominance analysis (no solar-specific code).

Definitions
-----------
For active objectives f_1..f_k, each with a direction (maximize/minimize), candidate A
dominates B iff A is at least as good as B on every objective AND strictly better on at
least one. A candidate is Pareto-optimal (nondominated) iff no *analysed* candidate
dominates it. Exact duplicates do not dominate each other, so duplicated frontier points
are all reported as nondominated.

Candidates that are filtered out (``eligible`` mask False) or have a missing value in any
active objective are NOT analysed: they neither dominate nor are dominated and receive
status ``"filtered"`` / ``"missing"``. Missing values are never imputed.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np
import pandas as pd

MAXIMIZE, MINIMIZE = "maximize", "minimize"
_ALIASES = {"max": MAXIMIZE, "maximize": MAXIMIZE, "min": MINIMIZE, "minimize": MINIMIZE}


@dataclass(frozen=True)
class Objective:
    name: str
    direction: str

    def __post_init__(self):
        d = _ALIASES.get(str(self.direction).lower())
        if d is None:
            raise ValueError(f"direction must be maximize/minimize, got {self.direction!r}")
        object.__setattr__(self, "direction", d)

    @property
    def sign(self) -> float:
        """Multiplier that turns the objective into 'larger is better'."""
        return 1.0 if self.direction == MAXIMIZE else -1.0


def _as_objectives(objs: Iterable) -> list[Objective]:
    out = [o if isinstance(o, Objective) else Objective(*o) for o in objs]
    if not out:
        raise ValueError("at least one objective is required")
    names = [o.name for o in out]
    if len(set(names)) != len(names):
        raise ValueError("duplicate objective names")
    return out


def dominance_matrix(values: np.ndarray) -> np.ndarray:
    """values: (n, k) array where larger is better on every column.
    Returns D (n, n) bool with D[i, j] True iff i dominates j."""
    v = np.asarray(values, dtype=float)
    ge = (v[:, None, :] >= v[None, :, :]).all(axis=2)
    gt = (v[:, None, :] > v[None, :, :]).any(axis=2)
    return ge & gt


@dataclass
class ParetoResult:
    table: pd.DataFrame            # one row per input candidate (status, rank, dominator, ...)
    objectives: list[Objective]
    id_col: str
    _dom: np.ndarray               # dominance matrix over analysed rows
    _ids: np.ndarray               # ids of analysed rows (order of _dom)

    @property
    def frontier(self) -> pd.DataFrame:
        return self.table[self.table.status == "nondominated"]

    @property
    def dominated(self) -> pd.DataFrame:
        return self.table[self.table.status == "dominated"]

    def dominators_of(self, cid) -> list:
        j = np.flatnonzero(self._ids == cid)
        if not len(j):
            return []
        return self._ids[self._dom[:, j[0]]].tolist()

    def compare(self, a, b, data: pd.DataFrame) -> dict:
        """Objective-by-objective comparison of a vs b (signed raw differences a - b)."""
        ra = data.loc[data[self.id_col] == a].iloc[0]
        rb = data.loc[data[self.id_col] == b].iloc[0]
        out = {}
        for o in self.objectives:
            diff = float(ra[o.name] - rb[o.name])
            better = diff * o.sign > 0
            out[o.name] = {"a": float(ra[o.name]), "b": float(rb[o.name]), "diff": diff,
                           "direction": o.direction,
                           "a_is": "better" if better else ("equal" if diff == 0 else "worse")}
        return out

    def explain(self, b, data: pd.DataFrame, labels: dict | None = None, fmt: dict | None = None) -> str:
        """Plain-language reason why candidate b is (not) dominated."""
        row = self.table.loc[self.table[self.id_col] == b].iloc[0]
        if row.status != "dominated":
            return f"{b} is {row.status}."
        a = row.example_dominator
        cmp = self.compare(a, b, data)
        labels = labels or {}
        fmt = fmt or {}
        parts = []
        for o in self.objectives:
            c = cmp[o.name]
            lab = labels.get(o.name, o.name)
            f = fmt.get(o.name, "{:,.2f}")
            if c["a_is"] == "better":
                word = "higher" if o.direction == MAXIMIZE else "lower"
                parts.append(f"{word} {lab} ({f.format(c['a'])} vs {f.format(c['b'])})")
            else:
                parts.append(f"equal {lab} ({f.format(c['a'])})")
        return f"{b} is dominated by {a}: " + ", ".join(parts) + "."


def pareto_analysis(data: pd.DataFrame, objectives: Sequence, id_col: str = "id",
                    eligible: pd.Series | np.ndarray | None = None) -> ParetoResult:
    """Classify every row as nondominated / dominated / filtered / missing.

    Output table columns:
      status, pareto_rank (1 = frontier, 2 = frontier after removing rank 1, ...),
      n_dominators, n_dominated, example_dominator (a nondominated dominator when one
      exists, otherwise any dominator), and per-objective `diff_vs_dominator__<name>`
      (dominator minus candidate, raw units).
    """
    objs = _as_objectives(objectives)
    df = data.reset_index(drop=True)
    if id_col not in df:
        raise KeyError(id_col)
    if df[id_col].duplicated().any():
        raise ValueError("ids must be unique")
    names = [o.name for o in objs]
    elig = np.ones(len(df), bool) if eligible is None else np.asarray(eligible, bool)
    vals = df[names].to_numpy(dtype=float)
    missing = ~np.isfinite(vals).all(axis=1)
    analysed = elig & ~missing

    status = np.where(~elig, "filtered", np.where(missing, "missing", "dominated")).astype(object)
    idx = np.flatnonzero(analysed)
    signed = vals[idx] * np.array([o.sign for o in objs])
    D = dominance_matrix(signed)
    n_dom_by = D.sum(axis=0)
    nd = n_dom_by == 0
    status[idx[nd]] = "nondominated"

    # non-dominated sorting ranks
    rank = np.zeros(len(idx), int)
    remaining = np.ones(len(idx), bool)
    r = 0
    while remaining.any():
        r += 1
        sub = D[np.ix_(remaining, remaining)].sum(axis=0) == 0
        cur = np.flatnonzero(remaining)[sub]
        rank[cur] = r
        remaining[cur] = False

    ex = np.full(len(df), None, dtype=object)
    ids = df[id_col].to_numpy()
    for jj in np.flatnonzero(~nd):
        doms = np.flatnonzero(D[:, jj])
        front = doms[nd[doms]]
        pool = front if len(front) else doms
        # prefer the dominator that is strictly better on the most objectives
        better = (signed[pool] > signed[jj]).sum(axis=1)
        ex[idx[jj]] = ids[idx[pool[np.argmax(better)]]]

    t = pd.DataFrame({id_col: ids, "status": status})
    t["pareto_rank"] = pd.array([pd.NA] * len(df), dtype="Int64")
    t.loc[idx, "pareto_rank"] = rank
    t["n_dominators"] = pd.array([pd.NA] * len(df), dtype="Int64")
    t.loc[idx, "n_dominators"] = n_dom_by
    t["n_dominated"] = pd.array([pd.NA] * len(df), dtype="Int64")
    t.loc[idx, "n_dominated"] = D.sum(axis=1)
    t["example_dominator"] = ex
    pos = {v: i for i, v in enumerate(ids)}
    for o in objs:
        col = df[o.name].to_numpy(dtype=float)
        t[f"diff_vs_dominator__{o.name}"] = [
            col[pos[e]] - col[i] if e is not None else np.nan for i, e in enumerate(ex)]
    return ParetoResult(table=t, objectives=objs, id_col=id_col, _dom=D, _ids=ids[idx])


def tradeoff_ladder(frontier: pd.DataFrame, x: Objective, y: Objective) -> pd.DataFrame:
    """For a two-objective frontier, sort by x and report the marginal exchange rate
    between neighbouring frontier points in raw units (e.g. extra MWh per extra km).
    This avoids normalisation: it states what you give up for what you gain."""
    x, y = _as_objectives([x, y])
    f = frontier.sort_values(x.name, ascending=(x.direction == MINIMIZE)).reset_index(drop=True)  # best x first
    dx = f[x.name].diff()
    dy = f[y.name].diff()
    f[f"delta_{x.name}"] = dx
    f[f"delta_{y.name}"] = dy
    f[f"rate_{y.name}_per_{x.name}"] = dy / dx
    return f


def knee_point(frontier: pd.DataFrame, objectives: Sequence, transform: str = "range") -> pd.Series:
    """Prototype knee detection: the frontier point farthest from the hyperplane through the
    per-objective extreme points, after rescaling each objective (``range`` = min-max over the
    frontier, ``rank`` = rank-based). Returned distances depend on the rescaling, so callers
    should check stability across transforms before showing any 'balanced' label."""
    objs = _as_objectives(objectives)
    if len(frontier) < 3:
        return pd.Series(np.nan, index=frontier.index)
    v = frontier[[o.name for o in objs]].to_numpy(float) * np.array([o.sign for o in objs])
    if transform == "range":
        lo, hi = v.min(0), v.max(0)
        z = (v - lo) / np.where(hi > lo, hi - lo, 1)
    elif transform == "rank":
        z = (pd.DataFrame(v).rank(pct=True)).to_numpy()
    else:
        raise ValueError(transform)
    k = z.shape[1]
    if k == 1:
        return pd.Series(np.nan, index=frontier.index)
    # extreme points: best on each objective
    E = z[np.argmax(z, axis=0)]
    if k == 2:
        p, q = E[0], E[1]
        d = q - p
        n = np.array([-d[1], d[0]])
    else:
        n = np.linalg.svd(E[1:] - E[0])[2][-1]
        p = E[0]
    nn = np.linalg.norm(n)
    if nn == 0:
        return pd.Series(np.nan, index=frontier.index)
    n = n / nn
    if n.sum() < 0:  # orient towards the ideal (all-ones) corner
        n = -n
    return pd.Series((z - p) @ n, index=frontier.index)
