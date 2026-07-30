import type { ContentSection } from "./types";

const SITE_WIDE_CONTENT_SECTIONS = new Set<ContentSection>([
  "settings",
  "theme",
  "navigation",
  "footer",
]);

// Sections that primarily live on a dedicated inner page in a multi-page
// custom-repo site. When only one of these sections changes, we revalidate
// both "/" (homepage may embed a teaser) and the section's own page so ISR
// on the inner page is cleared without a blanket "all" purge.
// Sections not listed here fall back to just "/" (they are homepage-only in
// the current starter and have no dedicated route to revalidate).
const SECTION_PAGE_PATHS: Partial<Record<ContentSection, string>> = {
  services: "/services",
  story: "/about",
  testimonials: "/about",
  providers: "/about",
  contact: "/contact",
  faq: "/faq",
  events: "/events",
  shop: "/shop",
  products: "/shop",
  rewardsConfig: "/rewards",
};

export function clientRevalidationTargetForSections(
  sections: Iterable<ContentSection>,
  options?: { pageConfigChanged?: boolean }
): string[] | "all" {
  if (options?.pageConfigChanged) return "all";

  const paths = new Set<string>();

  for (const section of sections) {
    if (SITE_WIDE_CONTENT_SECTIONS.has(section)) return "all";
    paths.add("/");
    const innerPath = SECTION_PAGE_PATHS[section];
    if (innerPath) paths.add(innerPath);
  }

  // If no sections were provided, fall back to homepage only.
  return paths.size > 0 ? Array.from(paths) : ["/"];
}
