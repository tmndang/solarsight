# Data sources

Roles: **AUTHORITATIVE** (defines candidates or a frozen metric), **EPA BASELINE** (historical
screening values shown as such), **DERIVED INPUT** (used to compute a SolarSight metric),
**CONTEXT** (shown only), **VALIDATION** (checks only, not needed by the app), **GAP**.

Raw files under `data/raw/` are never edited. The manually downloaded datasets are tracked with Git LFS.

| # | Dataset | Provider | Role | Production dependency? |
|---|---|---|---|---|
| 1 | NC Brownfields Program project boundaries | NC DEQ | AUTHORITATIVE candidates (baseline scenario) | yes |
| 2 | RE-Powering Mapper screened sites (GDB + attribute-table CSV) | US EPA | EPA BASELINE + DEQ cross-reference + landfill permit evidence | yes |
| 3 | National Wetlands Inventory, NC | USFWS | DERIVED INPUT (NWI overlap, usable-area exclusion) | yes |
| 4 | 3DEP 1/3 arc-second DEM | USGS | DERIVED INPUT (terrain, usable area) | yes |
| 5 | Overture Maps `base/infrastructure` (OSM power) | OSM via Overture | DERIVED INPUT (current transmission distance) | yes |
| 6 | Overture Maps `buildings` | OSM/ML footprints via Overture | DERIVED INPUT (built-out flag, usable area) | yes |
| 7 | Overture Maps `base/water` | OSM via Overture | DERIVED INPUT (surface-water exclusion) | yes |
| 8 | Overture Maps `base/land_use` landfill/quarry/brownfield | OSM via Overture | secondary/exploratory candidates | yes (secondary scenarios) |
| 9 | Overture `transportation`, `divisions`, `base/land` wetland | OSM via Overture | CONTEXT (roads, counties) / superseded (OSM wetland) | context |
| 10 | NSRDB GOES v4.0.0 TMY-2024 + PVWatts v8 (PySAM) | NREL | approximated generation per MW (context) | cached; recomputable offline |
| 11 | EIA-860/923 via PUDL | EIA / Catalyst Cooperative | VALIDATION | no |
| 12 | FEMA NFHL | FEMA | **GAP – not integrated** | — |
| 13 | NC DEQ Brownfields Areas of Environmental Concern | NC DEQ | **GAP – not in repository** | — |

---

## 1. NC DEQ Brownfields Program project boundaries — AUTHORITATIVE

* **File**: `data/raw/NCBP_Feature_Poly_View_-1215719022186211726/ff89c245-760d-47d7-a462-4ebadb7ecc51.gdb`, layer `NCBP_Project_Poly`
* **Geometry**: MultiPolygon, 1,363 records, EPSG:2264 (NAD83 / North Carolina ftUS). 1 invalid geometry in source (repaired with `make_valid`, flagged `deq_geometry_valid_in_source=false`); 206 multipart.
* **Identifiers**: `BF_ID` (numeric) and `BF_Number` (e.g. `08041-04-049`), both unique; `GlobalID`. SolarSight ID = `DEQ-<BF_Number>`.
* **Fields used**: BF_Number, BF_Name, Address, City, County, BF_Acreage, Status, Status_Date, Allowed_Use, Restricted_Media, COC, Source, Instrument_Status, Rec_Docs_Link, EditDate.
* **Coded-value domains (from the GDB)**: Status = {Pending, Ineligible, Complete, Recorded, Inactive Eligible, Active Eligible, RFR PC Complete, No Further Interest}; Allowed Uses = {COM, IND, MIX, MRO, RES, NONE, NON REC, INSTNL, IND & COM}; Restricted Media = {MM, GW, IndrAir, Soil, SrfWtr}; Primary Contaminant, Source, Instrument Status, Certification.
* **No field documentation shipped** (empty item metadata). SolarSight therefore carries `Status` verbatim and does not interpret it.
* **Vintage**: EditDate 2025-07-17 … 2026-09-23. One `Status_Date` is in 2029 (data-entry error; left as is).
* **Area**: polygon acreage agrees with `BF_Acreage` (median ratio 1.00).
* **Limitations**: a program record says the property has brownfield history, not that it is vacant or available; many are redeveloped (see building coverage).

## 2. EPA RE-Powering Mapper screened sites — EPA BASELINE

* **Files**: `data/raw/re_powering_screening_geodatabase/re_powering_screening_geodatabase/re_powering_mapper_sites.gdb` (layer `re_powering_mapper_sites`, Point, 190,976 records, EPSG:3857) and `data/raw/DataRecords.csv` (the Mapper attribute-table export with full labels and units).
* **Same table**: all 6,074 NC records join 1:1 on Cross-Reference Number (`Ref`). Acreage, GHI, all distances and voltages are identical; Estimated PV Capacity differs only by CSV rounding to 2 dp. The CSV adds `Solar Installation Potential` (Y for all 6,074 NC rows, so it carries no information) and labelled units. 5 CSV rows nationwide (PA, MD, WV, TX, CA; none NC) have unescaped quotes and are skipped by the strict reader.
* **Conclusion**: the local download already contains every Mapper attribute. Nothing was re-downloaded or scraped.
* **NC programs**: NC Hazardous Waste Sites 2,577; **NC Brownfield Projects 973**; EPA Brownfields (ACRES) 946; NC Permitted Solid Waste Landfills 673; NC Pre-regulatory Landfills 656; LMOP 109; RCRA 89; Superfund 48; AML 3.
* **Fields used (GDB name → Mapper label, unit)**: Ref → Cross-Reference Number; SiteID → Site ID (= DEQ `BF_Number` for NC Brownfield Projects); Acreage → Acreage (acres); EstPVCap → Estimated PV Capacity (MW; **= acres / 6.9**, median implied 6.900 ac/MW, capped at 600 MW, AC/DC not stated); UtilPV → Utility Scale PV (Y iff EstPVCap >= 5 MW); DistribPV; GHI → Maximum Annual GHI (kWh/m²/day); TransDist → Distance to Nearest Transmission Line (**miles**); TLkV (kV); TLStatus; SSDist (miles); SSVoltage → "Nearest Substation Voltage (Volts)" — **values are kV** (100, 115, 230); RdDist, RailDist (miles); Latitude/Longitude.
* **Vintage**: not stated in the files. EPA's user guide / data documentation is dated 2022. Labelled `epa_screening_vintage` = "as downloaded; vintage not stated".
* **Limitations**: point geometry (address geocode); historical infrastructure layer; EPA acreage for NC brownfields is the DEQ-reported acreage at that time.

## 3. USFWS National Wetlands Inventory, North Carolina — DERIVED INPUT

* **File**: `data/raw/NC_geodatabase_wetlands/NC_geodatabase_wetlands.gdb`; layers `NC_Wetlands` (589,943 MultiPolygons), `North_Carolina`, `NC_Wetlands_Project_Metadata` (910 mapping projects), `NC_Wetlands_Historic_Map_Info`. CRS: NAD83 Albers (USGS CONUS).
* **Fields used**: `WETLAND_TYPE` (Riverine 230,514; Freshwater Forested/Shrub 197,199; Freshwater Pond 113,858; Freshwater Emergent 23,016; Estuarine & Marine Wetland 18,900; Estuarine & Marine Deepwater 4,767; Lake 1,656; Other 33), `ATTRIBUTE` (Cowardin code).
* **Classes used**: *NWI wetland* = Freshwater Forested/Shrub, Freshwater Emergent, Estuarine & Marine Wetland. *NWI water* = Riverine, Pond, Lake, Estuarine & Marine Deepwater (context only).
* **Coverage**: mapping projects cover 98.8% of NC; all 662 candidates are covered. **Imagery is old: median project image year 1983.**
* **Limitations**: not a jurisdictional delineation; 1980s imagery predates most redevelopment.

## 4. USGS 3DEP 1/3 arc-second DEM — DERIVED INPUT
`s3://prd-tnm/StagedProducts/Elevation/13/TIFF/current/`. COG, EPSG:4269, ~10 m, float32 m. Per-site windows cached in `data/raw/dem/`. Survey dates vary.

## 5–9. Overture Maps (OpenStreetMap-derived), release 2026-09-23.1 — ODbL
* `base/infrastructure` power: 14,899 `power_line` segments in the NC bbox, 89% voltage-tagged, 11,220 at >= 69 kV; 3,142 substations at >= 69 kV. OSM `power=line` represents existing lines; proposed/disused lines use other tags and are excluded.
* `buildings` (OSM + ML footprints): 10,288 footprints touching candidate polygons (`scripts/download_buildings.py`).
* `base/water` polygons (current surface water); `base/land` `subtype=wetland` (OSM `natural=wetland`, the layer phase 1 called "mapped wetland"; now `osm_mapped_wetland_*`, context only); `transportation/segment` roads; `divisions` NC boundary and counties.
* `base/land_use` landfill/quarry/brownfield polygons: secondary and exploratory candidates only. 21 OSM polygons that are at least 50% covered by DEQ polygons were dropped in favour of DEQ.

## 10. NREL NSRDB + PVWatts — cached approximation
GOES v4.0.0 TMY-2024 (S3 HDF5, 0.04° grid); cached per-pixel 8,760-h files in `data/raw/nsrdb_tmy/`. PVWatts v8 via `NREL-PySAM 7.1.1` runs locally.

## 11. EIA-860/923 via PUDL — VALIDATION only
934 NC PV plants. Used to validate PVWatts (model about 10% above observed; 92 fixed-tilt plants) and as a grid-distance yardstick.

## 12. FEMA NFHL — GAP (accepted)
Not acquired. Schema reserves `fema_flood_overlap_acres`, `fema_flood_overlap_pct` (null) and `fema_flood_data_status = "not_assessed"`.

## 13. NC DEQ Areas of Environmental Concern — GAP
Not present in `data/raw/` (the Brownfields GDB contains only `NCBP_Project_Poly`). Schema reserves `aec_overlap_acres`, `aec_count` (null) and `aec_data_status = "not_available"`.

## Phase-1 sources no longer in the production path
OSM disturbed-land polygons as the *primary* candidate list (superseded by DEQ for brownfields); OSM wetlands (superseded by NWI); ESA WorldCover (not used).
