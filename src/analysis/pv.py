"""Planning-level PV yield with NREL PVWatts v8 (PySAM, run locally) on NSRDB TMY weather."""
import numpy as np
import pandas as pd

from .assumptions import ASSUMPTIONS

ARRAY_TYPES = {"fixed open rack": 0, "fixed roof mount": 1, "1-axis": 2}
MODULE_TYPES = {"standard": 0, "premium": 1, "thin film": 2}


def nsrdb_to_sam(df: pd.DataFrame) -> dict:
    """Convert a cached NSRDB TMY frame (UTC index, 8760 rows) to a PySAM weather dict.

    NSRDB timestamps are UTC at hh:30. PVWatts expects local standard time, so values are
    rotated by the site's UTC offset (TMY convention: the year wraps around).
    """
    assert len(df) == 8760, len(df)
    tz = int(df["tz"].iloc[0])
    roll = lambda a: np.roll(np.asarray(a, dtype=float), tz).tolist()  # noqa: E731
    local = pd.date_range("2023-01-01 00:30", periods=8760, freq="h")
    return {
        "lat": float(df["lat"].iloc[0]), "lon": float(df["lon"].iloc[0]),
        "tz": tz, "elev": float(df["elevation"].iloc[0]),
        "year": [2023] * 8760, "month": local.month.tolist(), "day": local.day.tolist(),
        "hour": local.hour.tolist(), "minute": local.minute.tolist(),
        "dn": roll(df["dni"]), "df": roll(df["dhi"]), "gh": roll(df["ghi"]),
        "tdry": roll(df["air_temperature"]), "wspd": roll(df["wind_speed"]),
    }


def specific_yield(weather: dict, a: dict = ASSUMPTIONS) -> dict:
    """Run PVWatts v8 for a 1 MWdc system; return kWh/kWdc/yr, AC capacity factor, POA."""
    import PySAM.Pvwattsv8 as pvw

    m = pvw.new()
    m.SolarResource.solar_resource_data = weather
    sd = m.SystemDesign
    sd.system_capacity = 1000.0  # kWdc
    sd.dc_ac_ratio = a["dc_ac_ratio"]
    sd.array_type = ARRAY_TYPES[a["array_type"]]
    sd.tilt = a["tilt_deg"]
    sd.azimuth = a["azimuth_deg"]
    sd.losses = a["system_losses_pct"]
    sd.inv_eff = a["inverter_efficiency_pct"]
    sd.gcr = a["gcr"]
    m.Lifetime.system_use_lifetime_output = 0  # single year
    sd.module_type = MODULE_TYPES[a["module_type"]]
    m.execute()
    o = m.Outputs
    ac_kw = 1000.0 / a["dc_ac_ratio"]
    return {
        "kwh_per_kwdc": o.ac_annual / 1000.0,
        "ac_capacity_factor": o.ac_annual / (ac_kw * 8760),
        "poa_kwh_m2_yr": o.solrad_annual * 365,
        "ghi_kwh_m2_yr": float(np.sum(weather["gh"]) / 1000.0),
    }
