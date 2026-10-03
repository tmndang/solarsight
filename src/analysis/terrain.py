"""Terrain helpers: slope from a projected DEM (Horn 1981, as used by GDAL gdaldem)."""
import numpy as np


def horn_slope_pct(dem: np.ndarray, xres: float, yres: float) -> np.ndarray:
    """Percent slope (rise/run*100) with Horn's 3x3 finite differences.

    `dem` must be in a projected CRS whose linear unit matches `xres`/`yres` and the
    elevation unit (metres here). NaN in -> NaN out (including the 1-pixel border).
    """
    z = np.pad(dem.astype("float64"), 1, mode="constant", constant_values=np.nan)
    a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    d, f = z[1:-1, :-2], z[1:-1, 2:]
    g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * abs(xres))
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * abs(yres))
    return np.hypot(dzdx, dzdy) * 100.0


def pct_to_deg(p):
    return np.degrees(np.arctan(np.asarray(p) / 100.0))
