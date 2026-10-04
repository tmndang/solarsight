"""Download EIA-860/923 data for North Carolina solar PV plants (validation only).

Source: Catalyst Cooperative PUDL nightly build, s3://pudl.catalyst.coop/nightly/
  out_eia__yearly_generators        (EIA-860 + EIA-923 merged, per generator-year)
  core_eia860__scd_generators_solar (EIA-860 solar detail: tracking/fixed, tilt, MWdc)
These are used (a) to check our PVWatts specific yield against observed NC fleet output and
(b) to measure how far operating NC solar plants sit from mapped grid infrastructure.
Output: data/raw/eia_nc_solar_generators.parquet
"""
import os

import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs

from _common import RAW

COLS = ["plant_id_eia", "generator_id", "report_date", "plant_name_eia", "utility_name_eia",
        "technology_description", "prime_mover_code", "operational_status", "generator_operating_date",
        "capacity_mw", "net_capacity_mwdc", "capacity_factor", "net_generation_mwh",
        "latitude", "longitude", "county", "state"]
SOLAR = ["plant_id_eia", "generator_id", "report_date", "uses_technology_single_axis_tracking",
         "uses_technology_fixed_tilt", "tilt_angle_deg", "standard_testing_conditions_capacity_mwdc"]


def main():
    kw = dict(anonymous=True, region="us-west-2")
    if os.environ.get("HTTPS_PROXY"):
        kw["proxy_options"] = os.environ["HTTPS_PROXY"]
    fs = pafs.S3FileSystem(**kw)
    g = ds.dataset("pudl.catalyst.coop/nightly/out_eia__yearly_generators.parquet", filesystem=fs).to_table(
        columns=COLS, filter=(ds.field("state") == "NC") & (ds.field("prime_mover_code") == "PV")).to_pandas()
    s = ds.dataset("pudl.catalyst.coop/nightly/core_eia860__scd_generators_solar.parquet", filesystem=fs).to_table(
        columns=SOLAR, filter=pc.field("plant_id_eia").isin(g.plant_id_eia.unique().tolist())).to_pandas()
    g = g.merge(s, on=["plant_id_eia", "generator_id", "report_date"], how="left")
    g.to_parquet(RAW / "eia_nc_solar_generators.parquet", index=False)
    print(len(g), "generator-years;", g.plant_id_eia.nunique(), "plants;",
          g.report_date.min(), "-", g.report_date.max())


if __name__ == "__main__":
    main()
