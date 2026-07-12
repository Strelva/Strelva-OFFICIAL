import type { ComponentType } from "react";
import type { PageSectionConfig } from "./scaffold-client";

/**
 * Config-driven section renderer. Turns a page's `PageSectionConfig[]` (served by
 * the platform, per page/slug) into rendered sections — so a page's layout is
 * DATA, not code, and the AI can add/reorder/toggle sections without a repo change.
 *
 * The registry (section type -> component) is provided by the client repo, because
 * section *designs* are client-specific; the starter provides the mechanism, not
 * the components. An unknown section type is skipped (a section the repo doesn't
 * ship a component for yet) rather than crashing the page.
 */
export type SectionComponent = ComponentType<{ config: PageSectionConfig }>;
export type SectionRegistry = Record<string, SectionComponent>;

export function PageRenderer({
  sections,
  registry,
}: {
  sections: PageSectionConfig[];
  registry: SectionRegistry;
}) {
  const ordered = [...sections]
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      {ordered.map((section, i) => {
        const Component = registry[section.type];
        if (!Component) return null;
        return <Component key={`${section.type}-${section.order}-${i}`} config={section} />;
      })}
    </>
  );
}

/** Resolve a Next catch-all slug to a page key. `/` -> "home", `/about` -> "about". */
export function pageKeyFromSlug(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) return "home";
  return slug.join("/");
}
