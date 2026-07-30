import { describe, expect, it } from "vitest";
import { siteCapabilityManifestSchema } from "@/lib/schemas";
import { buildSiteCapabilityManifest } from "../../custom-repo-starter/scaffold-client";
import { defaults } from "../../custom-repo-starter/content-defaults";

/**
 * B4 end-to-end contract: the manifest the custom-repo starter PUBLISHES must be
 * accepted by the control plane's schema (the same `siteCapabilityManifestSchema`
 * that `getSiteCapabilityManifest` validates a fetched remote manifest against).
 * If this ever drifts, a real custom repo's manifest would be silently rejected
 * and the merge would fall back to the template — the exact bug B4 closes.
 */
describe("starter capability manifest ↔ control-plane schema", () => {
  const manifest = buildSiteCapabilityManifest(Object.keys(defaults), {
    customOnlyFeatures: ["cart", "checkout", "rewards"],
  });

  it("validates against the control-plane Zod schema", () => {
    const parsed = siteCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
  });

  it("declares the sections the starter actually renders", () => {
    // A representative spread of the ContentMap sections content-defaults ships.
    for (const section of ["hero", "services", "story", "contact", "products", "faq"]) {
      expect(manifest.sections[section]).toBeDefined();
      expect(manifest.sections[section]!.allowedActions).toContain("draft");
    }
  });

  it("marks commerce + rewards as custom-only, not AI-editable content", () => {
    expect(manifest.customOnlyFeatures).toEqual(["cart", "checkout", "rewards"]);
  });

  it("lets a repo restrict a section via sectionOverrides", () => {
    const restricted = buildSiteCapabilityManifest(["hero", "theme"], {
      sectionOverrides: { theme: { allowedActions: ["read"] } },
    });
    expect(restricted.sections.theme!.allowedActions).toEqual(["read"]);
    expect(restricted.sections.hero!.allowedActions).toContain("draft");
    expect(siteCapabilityManifestSchema.safeParse(restricted).success).toBe(true);
  });
});
