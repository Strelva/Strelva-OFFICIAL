import type {
  ContentSection,
  PageSectionConfig,
  SitePageConfig,
  TemplateId,
} from "@/lib/types";
import type { ComponentType, ReactNode } from "react";

export interface TemplateDefinition {
  id: TemplateId;

  components: Record<string, ComponentType<any>>;

  contentKeys: Record<string, ContentSection[]>;

  buildProps: (
    sectionConfig: PageSectionConfig,
    content: Record<string, unknown>,
    pageSlug: string
  ) => Record<string, unknown> | null;

  labels: Record<string, string>;

  editableSections: Record<string, string>;

  LayoutWrapper?: ComponentType<{ children: ReactNode }>;

  Header: ComponentType<any>;

  Footer: ComponentType<any>;

  themeVars: Record<string, string>;

  defaultPageConfig: SitePageConfig;

  contentSections: ContentSection[];
}

// Templates are registered here — imported lazily to avoid circular deps
let _registry: Record<TemplateId, TemplateDefinition> | null = null;

export function getTemplateRegistry(): Record<TemplateId, TemplateDefinition> {
  if (!_registry) {
    const { wellnessTemplate } = require("./wellness");
    const { foodBrandTemplate } = require("./food-brand");
    _registry = {
      wellness: wellnessTemplate,
      "food-brand": foodBrandTemplate,
    };
  }
  return _registry;
}

export function getTemplateForTenant(tenant: string): TemplateDefinition {
  // Lazy import to avoid circular dependency (tenants.ts is pure data)
  const { getTenantConfig } = require("@/lib/tenants");
  const config = getTenantConfig(tenant);
  const templateId: TemplateId = config?.template ?? "wellness";
  return getTemplateRegistry()[templateId];
}
