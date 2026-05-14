import type { ContentSection } from "./types";

const SITE_WIDE_CONTENT_SECTIONS = new Set<ContentSection>([
  "settings",
  "theme",
  "navigation",
  "footer",
]);

export function clientRevalidationTargetForSections(
  sections: Iterable<ContentSection>,
  options?: { pageConfigChanged?: boolean }
): string[] | "all" {
  if (options?.pageConfigChanged) return "all";

  for (const section of sections) {
    if (SITE_WIDE_CONTENT_SECTIONS.has(section)) return "all";
  }

  return ["/"];
}
