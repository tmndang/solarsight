import numpy as np
import pandas as pd
import pytest

from src.analysis.pareto import (Objective, dominance_matrix, knee_point, pareto_analysis,
                                 tradeoff_ladder)

OBJ3 = [("mwh", "maximize"), ("grid_km", "minimize"), ("slope", "minimize")]


def status(res):
    return dict(zip(res.table["id"], res.table["status"]))


def test_prompt_example_straightforward_dominance():
    df = pd.DataFrame({"id": ["A", "B", "C"], "mwh": [20000, 17000, 24000],
                       "grid_km": [2.0, 4.0, 8.0], "slope": [3.2, 5.1, 3.0]})
    r = pareto_analysis(df, OBJ3)
    s = status(r)
    assert s == {"A": "nondominated", "B": "dominated", "C": "nondominated"}
    row = r.table.set_index("id").loc["B"]
    assert row.example_dominator == "A"
    assert row["diff_vs_dominator__mwh"] == 3000
    assert row["diff_vs_dominator__grid_km"] == -2.0
    assert "dominated by A" in r.explain("B", df)
    assert r.dominators_of("B") == ["A"]


def test_mixed_directions_matter():
    df = pd.DataFrame({"id": [1, 2], "x": [1.0, 2.0], "y": [1.0, 2.0]})
    # maximize both: 2 dominates 1
    assert status(pareto_analysis(df, [("x", "max"), ("y", "max")]))[1] == "dominated"
    # maximize x, minimize y: genuine tradeoff, both nondominated
    s = status(pareto_analysis(df, [("x", "max"), ("y", "min")]))
    assert s == {1: "nondominated", 2: "nondominated"}
    # minimize both: 1 dominates 2
    assert status(pareto_analysis(df, [("x", "min"), ("y", "min")]))[2] == "dominated"


def test_ties_on_one_objective_still_dominate_if_strictly_better_elsewhere():
    df = pd.DataFrame({"id": ["a", "b"], "x": [5.0, 5.0], "y": [1.0, 2.0]})
    s = status(pareto_analysis(df, [("x", "max"), ("y", "min")]))
    assert s == {"a": "nondominated", "b": "dominated"}


def test_exact_duplicates_do_not_dominate_each_other():
    df = pd.DataFrame({"id": ["a", "b", "c"], "x": [5.0, 5.0, 1.0], "y": [1.0, 1.0, 9.0]})
    r = pareto_analysis(df, [("x", "max"), ("y", "min")])
    s = status(r)
    assert s["a"] == s["b"] == "nondominated"
    assert s["c"] == "dominated"
    assert set(r.dominators_of("c")) == {"a", "b"}


def test_multiple_pareto_optimal_and_ranks():
    df = pd.DataFrame({"id": list("abcde"), "x": [1, 2, 3, 1, 2], "y": [3, 2, 1, 2, 1]})
    r = pareto_analysis(df, [("x", "max"), ("y", "max")])
    t = r.table.set_index("id")
    assert set(r.frontier["id"]) == {"a", "b", "c"}
    assert t.loc["d", "pareto_rank"] == 2 and t.loc["e", "pareto_rank"] == 2
    assert t.loc["b", "n_dominated"] == 2  # b dominates d and e


def test_missing_values_are_excluded_not_imputed():
    df = pd.DataFrame({"id": ["a", "b", "c"], "x": [1.0, np.nan, 0.5], "y": [1.0, 100.0, 0.5]})
    r = pareto_analysis(df, [("x", "max"), ("y", "max")])
    s = status(r)
    assert s["b"] == "missing"
    assert s["a"] == "nondominated" and s["c"] == "dominated"
    assert pd.isna(r.table.set_index("id").loc["b", "pareto_rank"])


def test_one_objective_case():
    df = pd.DataFrame({"id": list("abc"), "x": [3.0, 7.0, 7.0]})
    s = status(pareto_analysis(df, [("x", "max")]))
    assert s == {"a": "dominated", "b": "nondominated", "c": "nondominated"}


def test_filtered_candidates_cannot_dominate():
    df = pd.DataFrame({"id": list("abc"), "x": [10.0, 5.0, 1.0], "y": [10.0, 5.0, 1.0]})
    r = pareto_analysis(df, [("x", "max"), ("y", "max")], eligible=[False, True, True])
    s = status(r)
    assert s == {"a": "filtered", "b": "nondominated", "c": "dominated"}
    assert r.table.set_index("id").loc["c", "example_dominator"] == "b"


def test_example_dominator_prefers_frontier_member():
    df = pd.DataFrame({"id": list("abc"), "x": [3, 2, 1], "y": [3, 2, 1]})
    r = pareto_analysis(df, [("x", "max"), ("y", "max")])
    assert r.table.set_index("id").loc["c", "example_dominator"] == "a"


def test_validation_errors():
    df = pd.DataFrame({"id": [1, 1], "x": [1, 2]})
    with pytest.raises(ValueError):
        pareto_analysis(df, [("x", "max")])
    with pytest.raises(ValueError):
        Objective("x", "bigger")
    with pytest.raises(ValueError):
        pareto_analysis(df.assign(id=[1, 2]), [])


def test_dominance_matrix_irreflexive_and_antisymmetric():
    rng = np.random.default_rng(0)
    v = rng.integers(0, 4, size=(60, 3)).astype(float)
    D = dominance_matrix(v)
    assert not D.diagonal().any()
    assert not (D & D.T).any()


def test_frontier_matches_bruteforce():
    rng = np.random.default_rng(1)
    df = pd.DataFrame({"id": range(80), "a": rng.random(80), "b": rng.random(80), "c": rng.random(80)})
    r = pareto_analysis(df, [("a", "max"), ("b", "min"), ("c", "max")])
    brute = set()
    for i, ri in df.iterrows():
        if not any((rj.a >= ri.a and rj.b <= ri.b and rj.c >= ri.c) and
                   (rj.a > ri.a or rj.b < ri.b or rj.c > ri.c) for _, rj in df.iterrows()):
            brute.add(ri.id)
    assert set(r.frontier["id"]) == brute


def test_tradeoff_ladder_and_knee():
    f = pd.DataFrame({"id": list("abcd"), "mwh": [100, 90, 50, 10], "km": [10.0, 2.0, 1.0, 0.5]})
    lad = tradeoff_ladder(f, ("mwh", "max"), ("km", "min"))
    assert list(lad["id"]) == ["a", "b", "c", "d"]
    assert lad.loc[1, "rate_km_per_mwh"] == pytest.approx(0.8)  # -8 km for -10 MWh
    k = knee_point(f, [("mwh", "max"), ("km", "min")])
    assert k.idxmax() == 1  # 'b' is the obvious elbow
