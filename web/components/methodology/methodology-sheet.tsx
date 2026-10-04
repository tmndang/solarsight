"use client";
import { useApp } from "@/store/app-store";
import { Accordion, Sheet } from "@/components/ui/primitives";
import { SourceBadge } from "@/components/shared/status";

const P = ({ children }: { children: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>;

const SOURCES: [string, string, string, string][] = [
  ["NC DEQ Brownfields Program", "Project boundaries, IDs, program status (shown verbatim)", "Candidate identity & geometry", "manual download, edits to Sep 2026"],
  ["US EPA RE-Powering Mapper", "Screened-site attribute table (GDB + CSV)", "Historical screening baseline", "as downloaded; documentation dated 2022"],
  ["USGS 3DEP", "1/3 arc-second DEM (~10 m)", "Slope, usable land", "current seamless product"],
  ["USFWS NWI", "NC wetlands geodatabase", "Mapped wetland overlap", "imagery mostly 1980s"],
  ["OpenStreetMap via Overture Maps", "Power lines ≥69 kV, buildings, water, landfill/quarry footprints", "Transmission proximity, built-over screen", "release 2026-09-23"],
  ["NREL NSRDB + PVWatts v8", "Typical-year weather, PV model (run offline)", "Generation per MW (context)", "GOES v4.0.0 TMY-2024"],
  ["EIA-860/923 via PUDL", "Operating NC PV plants", "Validation only", "nightly build Oct 2026"],
];

export function MethodologySheet() {
  const open = useApp((s) => s.methodologyOpen);
  const setOpen = useApp((s) => s.setMethodologyOpen);
  const meta = useApp((s) => s.data.meta);
  if (!meta) return null;
  const a = meta.assumptions;
  const perAc = meta.derived_constants.mw_ac_per_usable_acre;
  const items = [
    {
      value: "what", title: "What SolarSight is (and is not)", content: (
        <>
          <P>A screening and decision-support tool. You state a project size; SolarSight removes sites that cannot host it under
            explicit rules and shows the tradeoffs among the rest. There is no weighted suitability score.</P>
          <P>It does not assess interconnection capacity, queue position or cost, permitting, legal wetland jurisdiction,
            flood risk, contamination severity, ownership or site availability.</P>
        </>
      ),
    },
    {
      value: "candidates", title: "How candidates are selected", content: (
        <>
          <P><b className="text-text-primary">Brownfield projects</b>: NC DEQ Brownfields Program project polygons of at least {a.min_gross_acres_pool} gross acres.</P>
          <P><b className="text-text-primary">Baseline land screen</b>: removes sites where building footprints cover ≥ 25% of the boundary and sites with
            solar already mapped (OSM) or registered (EIA-860). DEQ program status is shown as recorded and not interpreted.</P>
          <P>Landfill and quarry sets are exploratory: mapped OpenStreetMap footprints with limited closure evidence. A brownfields
            record does not establish that a property is available for solar development.</P>
        </>
      ),
    },
    {
      value: "size", title: "Project-size feasibility", content: (
        <>
          <P>Project size is in MW AC. Land density: {a.mw_dc_per_usable_acre} MW DC per usable acre (LBNL 2019 fixed-tilt median, whole-plant
            footprint) ÷ DC/AC {a.dc_ac_ratio} = {perAc.toFixed(2)} MW AC per usable acre.</P>
          <table className="my-2 w-full text-xs">
            <thead><tr className="text-text-muted"><th className="text-left font-normal">Project</th><th className="text-right font-normal">Usable acres needed</th></tr></thead>
            <tbody>{a.target_sizes_mw_ac.map((t) => (
              <tr key={t} className="border-t border-border"><td className="py-1">{t} MW AC</td><td className="py-1 text-right font-mono text-text-primary">{(t / perAc).toFixed(1)}</td></tr>
            ))}</tbody>
          </table>
          <P>Usable land = 10 m pixels inside the boundary, minus buildings, mapped surface water, NWI-mapped wetland (switchable)
            and pixels steeper than the chosen grade. A site fits if usable acres ≥ needed acres. Capacity is a planning-level
            screening estimate, not an engineering design.</P>
        </>
      ),
    },
    {
      value: "terrain", title: "Terrain", content: (
        <>
          <P>USGS 3DEP 1/3″ DEM reprojected to NAD83 / North Carolina (metres) at 10 m; Horn slope. The <b className="text-text-primary">exclusion</b> uses
            percent grade (5 / 10 / 15%; 10% grade ≈ 5.7°). The <b className="text-text-primary">tradeoff objective</b> is the mean slope, in degrees, of
            the land that remains usable — so steep corners that would not be built on are not counted twice.</P>
          <P>Elevation survey dates vary; landfill and quarry topography may have changed since.</P>
        </>
      ),
    },
    {
      value: "grid", title: "Transmission proximity", content: (
        <>
          <P><b className="text-text-primary">Grid distance is measured from the candidate polygon boundary to the line</b>, not from a
            centroid or address point: it is the minimum planar distance (NAD83 / North Carolina, metres) between the current site
            polygon and the nearest OpenStreetMap power line tagged ≥ {a.grid_min_kv} kV. Lines without a voltage tag are excluded.</P>
          <P>A distance of exactly 0 is a geometric state, not a rounded number: a mapped ≥{a.grid_min_kv} kV line intersects the site
            boundary (true for every zero in this dataset). The app shows it as &ldquo;Mapped ≥69 kV line intersects site boundary&rdquo;,
            and the tradeoff chart keeps those sites at x = 0 under an &ldquo;Intersects&rdquo; tick. Sites that all intersect a line are
            tied on this objective; the Pareto comparison treats them as ties and separates them by terrain only.</P>
          <P>When a site is selected, the map draws the nearest mapped line (and any other line crossing the site) and, if the distance is
            above zero, the shortest boundary-to-line segment that was measured.</P>
          <P><b className="text-text-primary">It is only a proximity screening proxy.</b> A nearby or intersecting mapped line does not indicate
            interconnection capacity, hosting capacity, queue position, cost, right of way or availability, and OSM voltage tags can be
            incomplete.</P>
          <P>Checked against an independent brute-force calculation and against EPA&apos;s historical NC brownfield distances, which are also
            boundary-to-line: median absolute difference 0.01 km, Spearman 0.85; where SolarSight measures 0, EPA reports 0 for 62 of 63 matched
            sites. Remaining differences come from line definitions (EPA&apos;s historical layer includes 66 kV and unknown-voltage lines).</P>
        </>
      ),
    },
    {
      value: "nwi", title: "Mapped wetland screening (NWI)", content: (
        <P>USFWS National Wetlands Inventory vegetated-wetland classes. Overlap is reported as a share of the mapped project boundary.
          NWI identifies mapped wetland features for screening (NC imagery largely 1980s); it is not a jurisdictional determination.</P>
      ),
    },
    {
      value: "pareto", title: "Pareto frontier & strong alternatives", content: (
        <>
          <P>Among sites that fit the project, SolarSight minimises two quantities in their own units: distance to mapped transmission
            (km) and mean slope of usable land (°). Site A dominates B if A is no worse on both and better on at least one.</P>
          <P><b className="text-text-primary">Frontier</b>: sites no other feasible site dominates. <b className="text-text-primary">Strong alternatives</b>: sites
            that become non-dominated once the frontier (and then the next layer) is set aside — useful because no site&apos;s availability
            is known. These are layers, not ranks. Explanations compare the actual values; nothing is weighted or normalised.</P>
        </>
      ),
    },
    {
      value: "epa", title: "EPA RE-Powering baseline", content: (
        <>
          <P>EPA RE-Powering is a national first-pass renewable-energy screen. Its values (estimated PV = acres ÷ 6.9, GHI, distances in miles to
            EPA&apos;s own historical line layer) are shown separately and labelled as historical screening. SolarSight joins DEQ projects to
            EPA records by exact project ID where possible and never overwrites current DEQ geometry with EPA values.</P>
          <P>EPA distributes these records as points, but its transmission distances for &ldquo;North Carolina Brownfield Projects&rdquo; are
            not point-based: 13.6% are exactly 0 (vs 0.6–1.1% for EPA&apos;s NC hazardous-waste and landfill programs), and they match SolarSight&apos;s
            boundary-to-line distances to a median of 0.01 km. They should be read as boundary-based, measured on the boundary and line
            layer of that time.</P>
        </>
      ),
    },
    {
      value: "assumptions", title: "Assumptions (from the dataset)", content: (
        <dl className="space-y-2">
          {Object.entries(meta.assumption_basis).map(([k, v]) => (
            <div key={k}><dt className="font-mono text-xs text-text-primary">{k}</dt><dd className="text-xs">{v}</dd></div>
          ))}
        </dl>
      ),
    },
    {
      value: "sources", title: "Data sources", content: (
        <table className="w-full text-xs">
          <tbody>{SOURCES.map(([n, what, role, v]) => (
            <tr key={n} className="border-t border-border align-top">
              <td className="py-1.5 pr-2 font-medium text-text-primary">{n}</td>
              <td className="py-1.5 pr-2">{what}<br /><span className="text-text-muted">{role} · {v}</span></td>
            </tr>
          ))}</tbody>
        </table>
      ),
    },
    {
      value: "limits", title: "Limitations & not assessed", content: (
        <ul className="list-disc space-y-1.5 pl-4">
          {Object.values(meta.warnings).map((w) => <li key={w}>{w}</li>)}
          <li>NC DEQ Areas of Environmental Concern are not in this dataset.</li>
        </ul>
      ),
    },
  ];
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Methodology & data" description={`Dataset version ${meta.dataset_version} · ${meta.n_candidates} candidate sites · all data local`}>
      <div className="flex flex-wrap gap-1.5 px-5 py-3">
        <SourceBadge kind="derived" /><SourceBadge kind="epa" /><SourceBadge kind="deq" />
      </div>
      <Accordion items={items} defaultValue={["what"]} />
    </Sheet>
  );
}
