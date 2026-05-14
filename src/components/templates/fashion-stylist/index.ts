import type { ComponentType } from "react";
import type { ContentSection, PageSectionConfig, SitePageConfig } from "@/lib/types";
import type { TemplateDefinition } from "../registry";
import { JadaIveySite } from "./JadaIveySite";

const EmptyChrome = () => null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SECTION_COMPONENTS: Record<string, ComponentType<any>> = {
  "jada-home": JadaIveySite,
};

const SECTION_CONTENT_KEYS: Record<string, ContentSection[]> = {
  "jada-home": [],
};

const SECTION_LABELS: Record<string, string> = {
  "jada-home": "Jada Ivey Home",
};

const FASHION_STYLIST_PAGE_CONFIG: SitePageConfig = {
  home: {
    sections: [{ type: "jada-home", visible: true, order: 0 }],
    seo: {
      title: "By Jada Ivey",
      description:
        "Wardrobe styling, creative direction, brand styling, editorial styling, and closet organization.",
    },
  },
};

function buildSectionProps(
  sectionConfig: PageSectionConfig
): Record<string, unknown> | null {
  return sectionConfig.type === "jada-home" ? {} : null;
}

export const fashionStylistTemplate: TemplateDefinition = {
  id: "fashion-stylist",
  components: SECTION_COMPONENTS,
  contentKeys: SECTION_CONTENT_KEYS,
  buildProps: buildSectionProps,
  labels: SECTION_LABELS,
  editableSections: {},
  Header: EmptyChrome,
  Footer: EmptyChrome,
  themeVars: {},
  defaultPageConfig: FASHION_STYLIST_PAGE_CONFIG,
  contentSections: ["settings", "contact", "hero", "theme", "navigation", "footer"],
};
