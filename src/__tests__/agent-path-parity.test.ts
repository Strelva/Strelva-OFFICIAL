import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { SiteCapabilityManifest } from "@/lib/types";
import { resolveEditableSections, resolveGbpWriteAllowed } from "@/lib/agent-shared";

/**
 * Parity between the two AI-agent execution paths (streaming route + background
 * executor). The executor used to skip the manifest gate and the GBP write gate;
 * these now live in `agent-shared` and must be honored by BOTH paths.
 */

// ── resolveEditableSections (pure) ──────────────────────────────────────────
describe("resolveEditableSections", () => {
  const template = { contentSections: ["hero", "story", "contact"] };
  const manifest = (sections: Record<string, { allowedActions?: string[] }>) =>
    ({ sections } as unknown as SiteCapabilityManifest);

  it("excludes a section the manifest forbids drafting", () => {
    const { agentEditableSections, sectionEnum } = resolveEditableSections(
      template,
      manifest({ story: { allowedActions: ["read"] } }), // no "draft" → excluded
    );
    expect(agentEditableSections).toEqual(["hero", "contact"]);
    expect(sectionEnum.options).toEqual(["hero", "contact"]);
  });

  it("keeps sections whose manifest entry is absent (editable by default)", () => {
    const { agentEditableSections } = resolveEditableSections(template, manifest({}));
    expect(agentEditableSections).toEqual(["hero", "story", "contact"]);
  });

  it("falls back to the full template list when the manifest forbids everything", () => {
    const forbidAll = manifest(
      Object.fromEntries(template.contentSections.map((s) => [s, { allowedActions: ["read"] }])),
    );
    const { agentEditableSections, sectionEnum } = resolveEditableSections(template, forbidAll);
    expect(agentEditableSections).toEqual([]);
    // The enum must never be empty — it falls back to the full list.
    expect(sectionEnum.options).toEqual(template.contentSections);
  });
});

// ── resolveGbpWriteAllowed (gate) ───────────────────────────────────────────
const h = vi.hoisted(() => ({
  presence: "local" as string,
  connections: [] as Array<{ provider: string; status: string; scopes?: string[] }>,
  hasScope: true,
}));
vi.mock("@/lib/dashboard-surfaces", () => ({ getPresenceProfile: () => h.presence }));
vi.mock("@/lib/storage", () => ({ getContent: () => Promise.resolve({}) }));
vi.mock("@/lib/connections", () => ({ getConnections: () => Promise.resolve(h.connections) }));
vi.mock("@/lib/gbp-replies", () => ({ connectionHasWriteScope: () => h.hasScope }));

describe("resolveGbpWriteAllowed", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = { template: "wellness" } as any;
  beforeEach(() => {
    h.presence = "local";
    h.connections = [{ provider: "google", status: "connected", scopes: ["write"] }];
    h.hasScope = true;
  });

  it("is false for an online-only brand", async () => {
    h.presence = "online";
    expect(await resolveGbpWriteAllowed("t", cfg)).toBe(false);
  });
  it("is false with no connected Google account", async () => {
    h.connections = [];
    expect(await resolveGbpWriteAllowed("t", cfg)).toBe(false);
  });
  it("is false when the Google connection lacks the write scope", async () => {
    h.hasScope = false;
    expect(await resolveGbpWriteAllowed("t", cfg)).toBe(false);
  });
  it("is true for a local business with a write-scoped Google connection", async () => {
    expect(await resolveGbpWriteAllowed("t", cfg)).toBe(true);
  });
});

// ── Source parity: both paths wire the shared gates; the skip is gone ────────
describe("agent path parity (wiring)", () => {
  const executor = readFileSync(path.join(process.cwd(), "src/lib/agent-executor.ts"), "utf8");
  const route = readFileSync(path.join(process.cwd(), "src/app/api/agent/route.ts"), "utf8");

  it("executor threads the manifest into applySectionUpdate (was skipped)", () => {
    expect(executor).toContain("siteManifest,");
    expect(executor).not.toContain("manifest gate is intentionally skipped");
  });

  it("executor gates GBP tools behind the shared write check", () => {
    expect(executor).toContain("resolveGbpWriteAllowed");
    expect(executor).toContain("if (gbpWriteAllowed)");
  });

  it("both paths resolve editable sections + GBP gate from the shared module", () => {
    expect(executor).toContain("resolveEditableSections");
    expect(route).toContain("resolveEditableSections(template, siteManifest)");
    expect(route).toContain("resolveGbpWriteAllowed(tenant");
  });
});
