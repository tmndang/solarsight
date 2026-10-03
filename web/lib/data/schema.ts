/**
 * Zod schema for data/app/candidates.geojson properties and data/app/meta.json.
 * Numbers must be JSON numbers or null (a past export bug wrote floats as strings; this catches it).
 * Missing values stay `null` — they are never coerced to 0.
 */
import { z } from "zod";

const num = z.number().finite().nullable();
const req = z.number().finite();
const str = z.string().nullable();

export const CandidatePropsSchema = z.object({
  site_id: z.string(),
  name: z.string(),
  site_type: z.enum(["brownfield", "landfill", "quarry"]),
  primary_source: z.enum(["nc_deq_brownfields", "osm_overture"]),
  source_id: z.string(),
  county: z.string(),
  city: str,
  address: str,
  latitude: req,
  longitude: req,
  gross_area_acres: req,
  deq_status: str,
  deq_status_date: str,
  deq_reported_acres: num,
  deq_allowed_use: str,
  deq_restricted_media: str,
  deq_docs_link: str,
  candidate_status: z.enum(["deq_brownfield_record", "likely_closed", "mixed", "status_unknown",
    "likely_active", "likely_built_out", "existing_solar"]),
  screening_confidence: z.enum(["high", "medium", "low"]),
  status_reason: z.string(),
  building_coverage_pct: num,
  epa_match_method: str,
  epa_match_confidence: str,
  epa_cross_reference_number: num,
  epa_site_id: str,
  epa_program: str,
  epa_screening_acres: num,
  epa_estimated_pv_capacity_mw: num,
  epa_max_annual_ghi_kwh_m2_day: num,
  epa_utility_scale_pv: str,
  epa_transmission_distance_miles: num,
  epa_transmission_kv: num,
  epa_transmission_status: str,
  epa_substation_distance_miles: num,
  epa_substation_voltage_kv: num,
  epa_road_distance_miles: num,
  epa_screening_vintage: str,
  mean_slope_deg: num,
  p90_slope_deg: num,
  steep_gt5pct_share: num,
  steep_gt10pct_share: num,
  steep_gt15pct_share: num,
  usable_mean_slope_deg_slope5: num,
  usable_mean_slope_deg_slope10: num,
  usable_mean_slope_deg_slope15: num,
  buildable_base_acres: num,
  usable_acres_slope5: num,
  usable_acres_slope10: num,
  usable_acres_slope15: num,
  usable_acres_slope5_nwi_not_excluded: num,
  usable_acres_slope10_nwi_not_excluded: num,
  usable_acres_slope15_nwi_not_excluded: num,
  estimated_max_capacity_mw_ac: num,
  estimated_max_capacity_mw_dc: num,
  annual_mwh_per_mw_ac: num,
  ac_capacity_factor: num,
  grid_line_distance_km: num,
  nearest_line_kv: num,
  substation_distance_km: num,
  road_distance_km: num,
  nwi_data_status: z.string(),
  nwi_wetland_overlap_acres: num,
  nwi_wetland_overlap_pct: num,
  nwi_water_overlap_pct: num,
  nwi_mapping_image_year: num,
  surface_water_overlap_pct: num,
  osm_mapped_wetland_overlap_pct: num,
  fema_flood_data_status: z.string(),
  fema_flood_overlap_pct: num,
  aec_data_status: z.string(),
});
export type CandidateProps = z.infer<typeof CandidatePropsSchema>;

const Polygonal = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(z.array(z.number())))) }),
]);

export const CandidatesSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({
    type: z.literal("Feature"),
    properties: CandidatePropsSchema,
    geometry: Polygonal,
  })).min(1),
});
export type CandidateCollection = z.infer<typeof CandidatesSchema>;
export type CandidateFeature = CandidateCollection["features"][number];

export const MetaSchema = z.object({
  dataset_version: z.string(),
  n_candidates: z.number().int(),
  assumptions: z.object({
    min_gross_acres_pool: z.number(),
    target_sizes_mw_ac: z.array(z.number()),
    mw_dc_per_usable_acre: z.number(),
    dc_ac_ratio: z.number(),
    slope_exclusion_pct: z.number(),
    slope_exclusion_options_pct: z.array(z.number()),
    exclude_nwi_wetlands_from_usable: z.boolean(),
    grid_min_kv: z.number(),
  }).passthrough(),
  assumption_basis: z.record(z.string(), z.string()),
  derived_constants: z.object({ mw_ac_per_usable_acre: z.number() }).passthrough(),
  fields: z.record(z.string(), z.object({
    group: z.string(), provenance: z.string(), unit: z.string().nullable(), label: z.string(),
  })),
  statuses: z.array(z.string()),
  scenarios: z.record(z.string(), z.object({ site_types: z.array(z.string()), statuses: z.array(z.string()) })),
  warnings: z.record(z.string(), z.string()),
});
export type Meta = z.infer<typeof MetaSchema>;

/** Validate both files; throws an Error whose message names the first offending path. */
export function parseData(rawCandidates: unknown, rawMeta: unknown) {
  const c = CandidatesSchema.safeParse(rawCandidates);
  if (!c.success) {
    const i = c.error.issues[0];
    throw new Error(`candidates.geojson: ${i.path.join(".")}: ${i.message}`);
  }
  const m = MetaSchema.safeParse(rawMeta);
  if (!m.success) {
    const i = m.error.issues[0];
    throw new Error(`meta.json: ${i.path.join(".")}: ${i.message}`);
  }
  const ids = new Set<string>();
  for (const f of c.data.features) {
    if (ids.has(f.properties.site_id)) throw new Error(`candidates.geojson: duplicate site_id ${f.properties.site_id}`);
    ids.add(f.properties.site_id);
  }
  return { candidates: c.data, meta: m.data };
}
