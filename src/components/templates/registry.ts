import type {
  ContentSection,
  PageSectionConfig,
  SitePageConfig,
  TemplateId,
} from "@/lib/types";
import type { ComponentType, ReactNode } from "react";
import { wellnessTemplate } from "./wellness";
import { foodBrandTemplate } from "./food-brand";
import { restaurantTemplate } from "./restaurant";
import { tradesTemplate } from "./trades";
import { professionalTemplate } from "./professional";
import { fashionStylistTemplate } from "./fashion-stylist";

// Each template defines its own section/header/footer component shapes,
// so prop types are intentionally polymorphic. Props are built via buildProps
// and spread into the component at render time.
/* eslint-disable @typescript-eslint/no-explicit-any */

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

/* eslint-enable @typescript-eslint/no-explicit-any */

const _registry: Record<string, TemplateDefinition> = {
  wellness: wellnessTemplate,
  "food-brand": foodBrandTemplate,
  restaurant: restaurantTemplate,
  trades: tradesTemplate,
  professional: professionalTemplate,
  "fashion-stylist": fashionStylistTemplate,
};

export function getTemplateRegistry(): Record<string, TemplateDefinition> {
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
