import type { ContentSection, SitePageConfig, PageSectionConfig, PageConfig } from "@/lib/types";
import { getContent, getDraftPageConfig, getPageConfig } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { SectionErrorBoundary } from "./SectionErrorBoundary";

interface SectionRendererProps {
  pageSlug: string;
  tenant: string;
  /** Accepted from callers (e.g. ?edit=true query param) but not yet wired to any
   *  server-side behavior in SectionRenderer itself. The dashboard's client-side
   *  edit overlay is driven by DashboardContext instead. Remove this prop when
   *  callers are updated to stop passing it. */
  editMode?: boolean;
  preview?: boolean;
}

function getLayoutClasses(layout?: PageSectionConfig['layout']): string {
  const classes: string[] = [];

  // Gap classes
  const gapMap = {
    tight: 'reb-gap-tight',
    normal: 'reb-gap-normal',
    loose: 'reb-gap-loose',
  };
  if (layout?.gap) {
    classes.push(gapMap[layout.gap]);
  }

  // Padding classes
  const paddingMap = {
    none: 'reb-padding-none',
    normal: 'reb-padding-normal',
    spacious: 'reb-padding-spacious',
  };
  if (layout?.padding) {
    classes.push(paddingMap[layout.padding]);
  }

  return classes.join(' ');
}

export async function SectionRenderer({ pageSlug, tenant, editMode: _editMode, preview }: SectionRendererProps) {
  const template = await getTemplateForTenant(tenant);

  // Load page config — fall back to template defaults
  let pageConfig: SitePageConfig;
  try {
    pageConfig = (preview ? await getDraftPageConfig(tenant) : null)
      || await getPageConfig(tenant)
      || template.defaultPageConfig;
  } catch {
    pageConfig = template.defaultPageConfig;
  }

  const rawStoredPage = pageConfig[pageSlug];
  const defaultPage = template.defaultPageConfig[pageSlug];
  const storedPage = rawStoredPage?.sections?.length ? rawStoredPage : undefined;
  const fallbackPage: PageConfig | undefined = pageSlug === "contact" && template.components.contact
    ? {
        sections: [{ type: "contact", visible: true, order: 0 }],
        seo: {},
      }
    : undefined;
  if (!storedPage && !defaultPage && !fallbackPage) return null;

  // Merge: use stored config but add any new default sections not present
  let pageSections = (storedPage || defaultPage || fallbackPage)!.sections;
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

  // Fetch all content in parallel (with preview mode if enabled). A transient
  // backend error on any section must not 500 the whole client site — each
  // section sits in a <SectionErrorBoundary>, so a missing section degrades
  // gracefully instead of taking the visitor's page down.
  const contentKeys = Array.from(contentKeysSet);
  const fetchOptions = preview ? { preview: true } : undefined;
  const results = await Promise.all(
    contentKeys.map((k) => getContent(k, tenant, fetchOptions).catch(() => undefined))
  );
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
        const layoutClasses = getLayoutClasses(sectionConfig.layout);

        return (
          <div
            key={`${sectionConfig.type}-${sectionConfig.order}`}
            data-reb-section={sectionConfig.type}
            data-reb-editable={editableSection || undefined}
            data-reb-label={template.labels[sectionConfig.type]}
            className={layoutClasses || undefined}
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
