export const PERIODS = [
  { value: "morning", label: "Morning (AM)" },
  { value: "afternoon", label: "Afternoon (PM)" },
] as const;
// Before noon: morning. Compared with a local "HH" or "HH:mm" text, on the device and in the export view.
export const NOON = "12";

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
