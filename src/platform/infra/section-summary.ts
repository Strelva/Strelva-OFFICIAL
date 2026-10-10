/** Browser-safe section summary used by the managed website editor and previews. */
export interface SectionData {
  preview: string;
  status: "live" | "empty" | "configured";
  count?: string;
  chatPrompt: string;
  items?: { label: string; detail?: string }[];
  freshness?: "fresh" | "aging" | "stale" | "unknown";
}
