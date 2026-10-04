/** Display formatting (UI_SPEC §18). Callers must handle null themselves — no function here turns null into 0. */

export const fmtKm = (v: number) => (Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1)) + " km";
/**
 * grid_line_distance_km === 0 is a geometric state, not a small number: a mapped ≥69 kV line crosses the
 * candidate polygon boundary (verified for every zero in scripts/export_grid_context.py). Never show "0.00 km".
 */
export const GRID_INTERSECTS = "Mapped ≥69 kV line intersects site boundary";
export const gridIntersects = (v: number | null | undefined): v is 0 => v === 0;
/** Value-only form for cells/rows whose label already reads "Mapped ≥69 kV line". */
export const fmtGridValue = (v: number) => (v === 0 ? "Intersects site boundary" : fmtKm(v));
/** Stand-alone phrase (lists, tooltips, accessible names). */
export const fmtGridPhrase = (v: number) => (v === 0 ? GRID_INTERSECTS : `${fmtKm(v)} to mapped ≥69 kV line`);
export const fmtDeg = (v: number) => (Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(2) : v.toFixed(1)) + "°";
export const fmtAc = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " ac";
export const fmtMwAc = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " MW AC";
export const fmtPct = (v: number, dp = 1) => v.toFixed(dp) + "%";
export const fmtMi = (v: number) => v.toFixed(2) + " mi";
export const fmtKv = (v: number) => `${Math.round(v)} kV`;
export const fmtMwh = (v: number) => "≈ " + (Math.round(v / 100) * 100).toLocaleString("en-US") + " MWh/yr";
export const fmtShare = (v: number) => (v * 100).toFixed(0) + "%";

/** "13.0" -> "13", keep one decimal otherwise; used for MW option labels */
export const fmtMwShort = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export const SITE_TYPE_LABEL: Record<string, string> = { brownfield: "Brownfield", landfill: "Landfill", quarry: "Quarry" };
