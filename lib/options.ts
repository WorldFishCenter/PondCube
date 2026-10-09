export const PERIODS = [
  { value: "morning", label: "Morning (AM)" },
  { value: "afternoon", label: "Afternoon (PM)" },
] as const;

export const FEED_TYPES = [
  { value: "pellet", label: "Pellet" },
  { value: "mash", label: "Mash" },
  { value: "other", label: "Other" },
] as const;

export const CAUSES = [
  { value: "disease", label: "Disease" },
  { value: "predation", label: "Predation" },
  { value: "handling", label: "Handling" },
  { value: "water_quality", label: "Water quality" },
  { value: "unknown", label: "Unknown" },
  { value: "other", label: "Other" },
] as const;
