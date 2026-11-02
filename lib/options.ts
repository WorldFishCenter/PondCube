export const PERIODS = [
  { value: "morning", label: "Morning (AM)" },
  { value: "afternoon", label: "Afternoon (PM)" },
] as const;
// Before noon: morning. Compared with a local "HH" or "HH:mm" text, on the device and in the export view.
export const NOON = "12";
/** The Period of a local "YYYY-MM-DDTHH:mm". */
export const periodAt = (local: string): (typeof PERIODS)[number]["value"] =>
  local.split("T")[1] < NOON ? "morning" : "afternoon";

// ponytail: the old Penang log's area order; other areas follow alphabetically. Put an order in Airtable when another site has areas.
const AREA_ORDER = [
  "Hatchery",
  "Fish Tank 1",
  "Fish Tank 2",
  "Fish Tank 3",
  "Block L",
  "Water Storage",
  "Aqua",
  "Pond",
];
const areaRank = (area: string) => (AREA_ORDER.includes(area) ? AREA_ORDER.indexOf(area) : AREA_ORDER.length);
export const byArea = (a: string, b: string) => areaRank(a) - areaRank(b) || a.localeCompare(b);

/** Ponds by Site and Area, Areas in walking order, ponds as given. Named with the Site only when there are several. */
export function areasOf<P extends { site: string; area: string }>(ponds: P[]) {
  const several = new Set(ponds.map((p) => p.site)).size > 1;
  const areas = new Map<string, { value: string; site: string; area: string; label: string; items: P[] }>();
  for (const pond of ponds) {
    const value = `${pond.site}:${pond.area}`;
    const known = areas.get(value);
    if (known) known.items.push(pond);
    else
      areas.set(value, {
        value,
        site: pond.site,
        area: pond.area,
        label: several ? `${pond.site} · ${pond.area}` : pond.area,
        items: [pond],
      });
  }
  return [...areas.values()].sort((a, b) => a.site.localeCompare(b.site) || byArea(a.area, b.area));
}

/** The number a pond code ends in, as painted on the Pond; the whole code if it has none. */
export const pondNumber = (pondCode: string) => Number(pondCode.match(/\d+$/)?.[0] ?? NaN) || pondCode;

// WorldFish DMS v5 causes of death (CAUSE_DEATH), in its order, shown as the DMS writes them.
export const CAUSES = [
  { value: "Cull_post_harvest_measure", label: "Cull_post_harvest_measure" },
  { value: "Cull_post_mating", label: "Cull_post_mating" },
  { value: "Cull_final", label: "Cull_final" },
  { value: "Cull_other", label: "Cull_other" },
  { value: "Disease_parasites", label: "Disease_parasites" },
  { value: "Handling_mortality", label: "Handling_mortality" },
  { value: "Measurement_mortality", label: "Measurement_mortality" },
  { value: "Missing", label: "Missing" },
  { value: "Tagging_mortality", label: "Tagging_mortality" },
  { value: "Unknown", label: "Unknown" },
  { value: "Water_quality", label: "Water_quality" },
] as const;
