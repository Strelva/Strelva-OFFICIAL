import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { providerDefinition } from "@/platform/connections/providers";
import { capabilityPromptFragment, getAllTools } from "@/lib/capabilities";

// Social posting is retired: no Connection can post (Instagram only reads),
// so nothing may promise to draft-and-publish social content.
const root = process.cwd();

describe("social posting is retired", () => {
  it("has no /api/social route", () => {
    expect(existsSync(path.join(root, "src/app/api/social/route.ts"))).toBe(false);
  });

  it("registers no social chat tools", () => {
    const names = getAllTools("chat") as Set<string>;
    expect(names.has("draft_social_post")).toBe(false);
    expect(names.has("list_social_posts")).toBe(false);
  });

  it("does not mention social in the capability prompt", () => {
    expect(capabilityPromptFragment()).not.toMatch(/social/i);
  });

  it("keeps Instagram read only", () => {
    expect(providerDefinition("instagram").acts).toBeNull();
  });

  it("carries no draft-social copy in the composer or registry", () => {
    // The old prompt box is retired; Ask Strelva uses XaComposer (ChatPanel).
    for (const file of ["src/components/dashboard/ChatPanel.tsx", "src/lib/integration-registry.ts"]) {
      expect(readFileSync(path.join(root, file), "utf8")).not.toContain("Draft social post");
    }
  });
});
