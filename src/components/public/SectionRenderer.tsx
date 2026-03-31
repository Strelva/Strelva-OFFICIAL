import type { ContentSection, SitePageConfig } from "@/lib/types";
import { getContent, getPageConfig } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { SectionErrorBoundary } from "./SectionErrorBoundary";

interface SectionRendererProps {
  pageSlug: string;
  tenant: string;
  editMode?: boolean;
}

export async function SectionRenderer({ pageSlug, tenant, editMode }: SectionRendererProps) {
  const template = getTemplateForTenant(tenant);

  // Load page config
  let pageConfig: SitePageConfig;
  try {
    pageConfig = await getPageConfig(tenant);
  } catch {
    pageConfig = template.defaultPageConfig;
  }

  const storedPage = pageConfig[pageSlug];
  const defaultPage = template.defaultPageConfig[pageSlug];
  if (!storedPage && !defaultPage) return null;

  // Merge: use stored config but add any new default sections not present
  let pageSections = (storedPage || defaultPage)!.sections;
  if (storedPage && defaultPage) {
    const storedTypes = new Set(storedPage.sections.map((s) => s.type));
    const newDefaults = defaultPage.sections.filter((s) => !storedTypes.has(s.type));
    if (newDefaults.length > 0) {
      pageSections = [...storedPage.sections, ...newDefaults];
    }
  }

  // Get visible sections sorted by order
  const visibleSections = pageSections
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  // Collect all unique content keys needed
  const contentKeysSet = new Set<ContentSection>();
  for (const section of visibleSections) {
    const keys = template.contentKeys[section.type] || [];
    for (const k of keys) contentKeysSet.add(k);
    // page-header can reference content via contentKey prop
    if (section.props?.contentKey) {
      contentKeysSet.add(section.props.contentKey as ContentSection);
    }
  }

  // Fetch all content in parallel
  const contentKeys = Array.from(contentKeysSet);
  const results = await Promise.all(contentKeys.map((k) => getContent(k, tenant)));
  const content: Record<string, unknown> = {};
  contentKeys.forEach((k, i) => {
    content[k] = results[i];
  });

  return (
    <>
      {visibleSections.map((sectionConfig) => {
        const Component = template.components[sectionConfig.type];
        if (!Component) return null;

        const props = template.buildProps(sectionConfig, content, pageSlug);
        if (!props) return null;

        const editableSection = template.editableSections[sectionConfig.type];

        return (
          <div
            key={`${sectionConfig.type}-${sectionConfig.order}`}
            data-reb-section={sectionConfig.type}
            data-reb-editable={editableSection || undefined}
            data-reb-label={template.labels[sectionConfig.type]}
          >
            <SectionErrorBoundary>
              <Component {...props} />
            </SectionErrorBoundary>
          </div>
        );
      })}
    </>
  );
}
