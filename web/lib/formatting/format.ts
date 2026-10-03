/** Display formatting (UI_SPEC §18). Callers must handle null themselves — no function here turns null into 0. */

export const fmtKm = (v: number) => (Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1)) + " km";
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
