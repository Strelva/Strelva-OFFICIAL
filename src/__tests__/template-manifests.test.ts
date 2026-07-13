import { describe, expect, it } from "vitest";
import { getTemplateRegistry } from "@/components/templates/registry";
import { getTemplateManifest, getTemplateManifests } from "@/lib/template-manifests";

describe("lightweight template manifests", () => {
  it("stay aligned with the render registry", () => {
    const renderRegistry = getTemplateRegistry();

    for (const [id, metadata] of Object.entries(getTemplateManifests())) {
      const renderTemplate = renderRegistry[id];
      expect(renderTemplate, `${id} render template`).toBeDefined();
      expect(renderTemplate.contentSections).toEqual(metadata.contentSections);
      expect(Object.keys(renderTemplate.components).sort()).toEqual(
        [...metadata.componentTypes].sort()
      );
      expect(renderTemplate.editableSections).toEqual(metadata.editableSections);
    }
  });

  it("falls back to wellness for unknown or legacy values", () => {
    expect(getTemplateManifest("not-a-template").id).toBe("wellness");
    expect(getTemplateManifest(undefined).id).toBe("wellness");
  });
});
