"""Read the manually downloaded authoritative datasets (unchanged in data/raw/) into tidy tables.

  NC DEQ Brownfields Program project polygons  (file geodatabase, layer NCBP_Project_Poly)
  EPA RE-Powering Mapper sites, NC subset       (file geodatabase, layer re_powering_mapper_sites)
  USFWS NWI, North Carolina                     (file geodatabase, layer NC_Wetlands) - read lazily by mask

Outputs (data/interim/):
  deq_brownfields.parquet   all 1,363 DEQ project polygons, EPSG:32119, geometry made valid
  epa_repowering_nc.parquet NC RE-Powering points, EPSG:4326
The raw geodatabases are never modified.
"""
import glob

import geopandas as gpd
import pandas as pd
import pyogrio

from _common import ROOT, RAW, METRIC_CRS

INTERIM = ROOT / "data" / "interim"
INTERIM.mkdir(parents=True, exist_ok=True)

DEQ_GDB = glob.glob(str(RAW / "NCBP_Feature_Poly_View_*" / "*.gdb"))[0]
EPA_GDB = str(RAW / "re_powering_screening_geodatabase" / "re_powering_screening_geodatabase"
              / "re_powering_mapper_sites.gdb")
NWI_GDB = str(RAW / "NC_geodatabase_wetlands" / "NC_geodatabase_wetlands.gdb")

DEQ_KEEP = ["BF_ID", "BF_Number", "BF_Name", "Address", "City", "County", "BF_Acreage", "Status",
            "Status_Date", "COC", "Restricted_Media", "Allowed_Use", "Source", "Instrument_Status",
            "Deed_Rec_Date", "Rec_Docs_Link", "LURU_Link", "EditDate"]


def read_deq_brownfields() -> gpd.GeoDataFrame:
    g = pyogrio.read_dataframe(DEQ_GDB, layer="NCBP_Project_Poly")
    assert g.crs.to_epsg() == 2264, g.crs  # NAD83 / North Carolina (ftUS)
    g = g[DEQ_KEEP + ["geometry"]].copy()
    g["deq_geometry_valid_in_source"] = g.is_valid
    g["geometry"] = g.geometry.make_valid()
    g = g.to_crs(METRIC_CRS)
    g["deq_part_count"] = g.geometry.apply(lambda x: len(x.geoms) if hasattr(x, "geoms") else 1)
    return g


EPA_CSV = RAW / "DataRecords.csv"
# Mapper attribute-table labels (from DataRecords.csv header) for the GDB short names we use.
EPA_LABELS = {
    "Ref": "Cross-Reference Number", "SiteID": "Site ID", "Acreage": "Acreage (Acres)",
    "EstPVCap": "Estimated PV Capacity (MW)", "UtilPV": "Utility Scale PV", "DistribPV": "Distributed Scale PV",
    "GHI": "Maximum Annual GHI (kWh/m2/day)", "SSDist": "Distance to Nearest Substation (miles)",
    "SSVoltage": "Nearest Substation Voltage (Volts)",  # header says Volts; values are kV (69, 100, 115, 230)
    "TransDist": "Distance to Nearest Transmission Line (miles)", "TLStatus": "Nearest Transmission Line Status",
    "TLkV": "Nearest Transmission Line kV (kilovolts)", "RdDist": "Distance to Nearest Road (miles)",
    "RailDist": "Distance to Nearest Rail (miles)",
}


def read_epa_csv_nc() -> pd.DataFrame:
    """NC rows of the Mapper attribute-table export. 5 malformed rows (unescaped quotes, none in NC)
    are skipped and reported."""
    import csv
    with open(EPA_CSV, newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        h = next(r)
        rows, bad = [], []
        for row in r:
            if len(row) != len(h):
                bad.append(row[:4])
            elif row[3] == "NC":
                rows.append(row)
    assert not any(b[3] == "NC" for b in bad if len(b) > 3)
    return pd.DataFrame(rows, columns=h)


def read_epa_nc() -> gpd.GeoDataFrame:
    """EPA RE-Powering NC records from the GDB (clean types, geometry) + the one CSV-only field."""
    e = pyogrio.read_dataframe(EPA_GDB, where="State = 'NC'")
    assert e.crs.to_epsg() == 3857, e.crs
    for c in e.columns:
        if e[c].dtype == object and c != "geometry":
            e[c] = e[c].where(e[c].map(lambda v: not isinstance(v, str) or v.strip() != ""), None)
    if EPA_CSV.exists():
        csvnc = read_epa_csv_nc()
        csvnc["Ref"] = csvnc["Cross-Reference Number"].astype(int)
        e = e.merge(csvnc[["Ref", "Solar Installation Potential"]].rename(
            columns={"Solar Installation Potential": "SolarInstallationPotential"}), on="Ref", how="left")
    return e.to_crs("EPSG:4326")


def read_nwi(mask_geom_4326=None) -> gpd.GeoDataFrame:
    """NWI polygons (optionally only those intersecting `mask`, given in EPSG:4326)."""
    kw = {}
    if mask_geom_4326 is not None:
        crs = pyogrio.read_info(NWI_GDB, layer="NC_Wetlands")["crs"]
        kw["mask"] = gpd.GeoSeries([mask_geom_4326], crs="EPSG:4326").to_crs(crs).iloc[0]
    return pyogrio.read_dataframe(NWI_GDB, layer="NC_Wetlands", **kw)


def main():
    deq = read_deq_brownfields()
    deq.to_parquet(INTERIM / "deq_brownfields.parquet")
    epa = read_epa_nc()
    epa.to_parquet(INTERIM / "epa_repowering_nc.parquet")
    print(f"DEQ {len(deq)} polygons ({(~deq.deq_geometry_valid_in_source).sum()} invalid in source, "
          f"{(deq.deq_part_count > 1).sum()} multipart); EPA NC {len(epa)} points")
    print(pd.Series(epa.Program).value_counts().to_string())


if __name__ == "__main__":
    main()
