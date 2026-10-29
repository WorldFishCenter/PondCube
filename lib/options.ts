export const PERIODS = [
  { value: "morning", label: "Morning (AM)" },
  { value: "afternoon", label: "Afternoon (PM)" },
] as const;

// WorldFish DMS v3 causes of death (CAUSE_DEATH), shown as the DMS writes them.
export const CAUSES = [
  { value: "Cull", label: "Cull" },
  { value: "Unknown", label: "Unknown" },
  { value: "Disease_parasites", label: "Disease_parasites" },
  { value: "Water_quality", label: "Water_quality" },
] as const;
