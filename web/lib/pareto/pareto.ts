/**
 * Generic Pareto dominance — TypeScript port of src/analysis/pareto.py (reference implementation).
 *
 * A dominates B iff A is no worse on every objective and strictly better on at least one.
 * Only `analysed` rows (eligible and with every objective value finite) take part; they are
 * processed in input order, which matters for the deterministic example-dominator tie-break.
 */
export type Direction = "minimize" | "maximize";
export interface Objective { key: string; direction: Direction }

export interface ParetoRow {
  id: string;
  /** 1 = frontier; 2 = frontier after removing layer 1; ... */
  layer: number;
  nDominators: number;
  nDominated: number;
  /** Python rule: prefer a frontier dominator; among the pool, the one strictly better on the
   *  most objectives; ties -> first in input order. null for frontier members. */
  exampleDominator: string | null;
}

export interface ParetoInput { id: string; values: number[] }

/** values are raw; sign handles direction (larger-is-better internally). */
export function paretoAnalysis(rows: ParetoInput[], objectives: Objective[]): Map<string, ParetoRow> {
  const n = rows.length;
  const k = objectives.length;
  const sign = objectives.map((o) => (o.direction === "maximize" ? 1 : -1));
  const v = rows.map((r) => r.values.map((x, j) => x * sign[j]));
  // D[i][j] = i dominates j
  const D: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(n));
  const nDomBy = new Int32Array(n);
  const nDom = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let ge = true;
      let gt = false;
      for (let t = 0; t < k; t++) {
        const d = v[i][t] - v[j][t];
        if (d < 0) { ge = false; break; }
        if (d > 0) gt = true;
      }
      if (ge && gt) { D[i][j] = 1; nDomBy[j]++; nDom[i]++; }
    }
  }
  // non-dominated sorting layers
  const layer = new Int32Array(n);
  const remaining = new Uint8Array(n).fill(1);
  let left = n;
  let r = 0;
  while (left > 0) {
    r++;
    const cur: number[] = [];
    for (let j = 0; j < n; j++) {
      if (!remaining[j]) continue;
      let dominated = false;
      for (let i = 0; i < n; i++) {
        if (remaining[i] && D[i][j]) { dominated = true; break; }
      }
      if (!dominated) cur.push(j);
    }
    for (const j of cur) { layer[j] = r; remaining[j] = 0; }
    left -= cur.length;
  }
  const out = new Map<string, ParetoRow>();
  for (let j = 0; j < n; j++) {
    let ex: string | null = null;
    if (nDomBy[j] > 0) {
      const doms: number[] = [];
      for (let i = 0; i < n; i++) if (D[i][j]) doms.push(i);
      const front = doms.filter((i) => nDomBy[i] === 0);
      const pool = front.length ? front : doms;
      let best = -1;
      let bestCount = -1;
      for (const i of pool) {
        let c = 0;
        for (let t = 0; t < k; t++) if (v[i][t] > v[j][t]) c++;
        if (c > bestCount) { bestCount = c; best = i; } // strict '>' keeps the first max (numpy argmax)
      }
      ex = rows[best].id;
    }
    out.set(rows[j].id, { id: rows[j].id, layer: layer[j], nDominators: nDomBy[j], nDominated: nDom[j], exampleDominator: ex });
  }
  return out;
}
