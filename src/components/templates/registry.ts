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
let _registry: Record<string, TemplateDefinition> | null = null;

export function getTemplateRegistry(): Record<string, TemplateDefinition> {
  if (!_registry) {
    const { wellnessTemplate } = require("./wellness");
    const { foodBrandTemplate } = require("./food-brand");
    const { restaurantTemplate } = require("./restaurant");
    const { tradesTemplate } = require("./trades");
    const { professionalTemplate } = require("./professional");
    _registry = {
      wellness: wellnessTemplate,
      "food-brand": foodBrandTemplate,
      restaurant: restaurantTemplate,
      trades: tradesTemplate,
      professional: professionalTemplate,
    };
  }
  return _registry;
}

export function registerTemplate(template: TemplateDefinition) {
  const registry = getTemplateRegistry();
  registry[template.id] = template;
}

export async function getTemplateForTenant(tenant: string): Promise<TemplateDefinition> {
  const { getTenantConfig } = await import("@/lib/tenants");
  const config = await getTenantConfig(tenant);
  const templateId = config?.template ?? "wellness";
  const registry = getTemplateRegistry();
  return registry[templateId] ?? registry["wellness"];
}
