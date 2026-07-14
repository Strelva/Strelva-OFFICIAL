import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { SiteCapabilityManifest } from "@/lib/types";
import { resolveEditableSections, resolveGbpWriteAllowed, buildGbpTools } from "@/lib/agent-shared";

// tool() passthrough so we can call .execute directly; events.addEvent mocked so
// the shared GBP factory queues against a fake rather than Redis.
const mockAddEvent = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ tool: (def: unknown) => def }));
vi.mock("@/lib/events", () => ({ addEvent: (...a: unknown[]) => mockAddEvent(...a) }));

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
      manifest({
        hero: { allowedActions: ["read", "draft"] },
        story: { allowedActions: ["read"] }, // no "draft" → excluded
        contact: { allowedActions: ["read", "draft"] },
      }),
    );
    expect(agentEditableSections).toEqual(["hero", "contact"]);
    expect(sectionEnum.options).toEqual(["hero", "contact"]);
  });

  it("excludes sections absent from the authoritative manifest", () => {
    const { agentEditableSections } = resolveEditableSections(template, manifest({}));
    expect(agentEditableSections).toEqual([]);
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

  // A custom repo may activate another registered content section, but a
  // manifest cannot invent a storage/schema entity at runtime.
  it("accepts registered extras and rejects unregistered manifest keys", () => {
    const withExtra = manifest({
      hero: { allowedActions: ["read", "draft"] },
      faq: { allowedActions: ["read", "draft"] },
      menu: { allowedActions: ["read", "draft"] },
    });
    const { agentEditableSections } = resolveEditableSections(template, withExtra);
    expect(agentEditableSections).toEqual(["hero", "faq"]);
  });

  it("excludes component render-keys, not just template sections", () => {
    const templateWithComponents = {
      contentSections: ["hero", "story", "contact"],
      components: { Header: () => null, Footer: () => null, hero: () => null },
    };
    // Manifest declares Header/Footer (component keys) — must NOT become editable.
    const withComponentKeys = manifest({
      hero: { allowedActions: ["read", "draft"] },
      Header: { allowedActions: ["read", "draft"] },
      Footer: { allowedActions: ["read", "draft"] },
    });
    const { agentEditableSections } = resolveEditableSections(
      templateWithComponents,
      withComponentKeys,
    );
    expect(agentEditableSections).not.toContain("Header");
    expect(agentEditableSections).not.toContain("Footer");
    expect(agentEditableSections).toEqual(["hero"]);
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

  it("both paths build GBP tools from the shared factory (no hand-rolled defs)", () => {
    expect(executor).toContain("buildGbpTools(");
    expect(route).toContain("buildGbpTools(");
    // The executor previously LACKED upload_gbp_photo — it must have it now.
    expect(executor).toContain("tools.upload_gbp_photo = gbpTools.upload_gbp_photo");
  });

  it("both paths build undo_last_change from the shared factory (executor gained it)", () => {
    expect(executor).toContain("buildUndoTool(");
    expect(route).toContain("buildUndoTool(");
    expect(executor).toContain("tools.undo_last_change = buildUndoTool");
  });
});

// ── buildGbpTools: the shared factory itself (B6) ───────────────────────────
describe("buildGbpTools", () => {
  beforeEach(() => {
    mockAddEvent.mockReset();
    mockAddEvent.mockResolvedValue({ id: "evt1" });
  });

  it("exposes all three GBP tools, including upload_gbp_photo", () => {
    const tools = buildGbpTools({ tenantId: "t", onQueued: () => {} });
    expect(Object.keys(tools).sort()).toEqual([
      "create_gbp_post",
      "update_business_hours",
      "upload_gbp_photo",
    ]);
  });

  it("queues a pending gbp_post_draft and fires onQueued (never writes to Google)", async () => {
    const queued: string[] = [];
    const tools = buildGbpTools({
      tenantId: "t",
      onQueued: (name, id) => { queued.push(`${name}:${id}`); },
    });
    // tool() is passthrough in this file, so .execute is directly callable.
    const def = tools.create_gbp_post as unknown as { execute: (a: unknown) => Promise<unknown> };
    const out = await def.execute({ summary: "Fall sale", ctaUrl: "https://x.com", photoUrl: undefined });

    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        metadata: expect.objectContaining({ kind: "gbp_post_draft", summary: "Fall sale" }),
      }),
    );
    expect(out).toMatchObject({ success: true, eventId: "evt1", agentResultStatus: "queued" });
    expect(queued).toEqual(["create_gbp_post:evt1"]);
  });

  it("create_gbp_post accepts an empty-string ctaUrl (no CTA) but rejects a non-URL", () => {
    // Regression guard: the model commonly emits ctaUrl:"" for 'no CTA'. A bare
    // .url() would reject the whole tool call and queue nothing; optionalUrl
    // treats "" as absent while still validating a real value.
    const tools = buildGbpTools({ tenantId: "t", onQueued: () => {} });
    const schema = (tools.create_gbp_post as unknown as { inputSchema: {
      safeParse: (v: unknown) => { success: boolean; data?: { ctaUrl?: string } };
    } }).inputSchema;

    const empty = schema.safeParse({ summary: "hi", ctaUrl: "" });
    expect(empty.success).toBe(true);
    expect(empty.data?.ctaUrl).toBeUndefined();

    expect(schema.safeParse({ summary: "hi", ctaUrl: "https://x.com/book" }).success).toBe(true);
    expect(schema.safeParse({ summary: "hi", ctaUrl: "not a url" }).success).toBe(false);
  });

  it("defaults the photo category to ADDITIONAL", async () => {
    const tools = buildGbpTools({ tenantId: "t", onQueued: () => {} });
    const def = tools.upload_gbp_photo as unknown as { execute: (a: unknown) => Promise<unknown> };
    await def.execute({ photoUrl: "https://x.com/p.jpg" });
    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ kind: "gbp_photo_draft", category: "ADDITIONAL" }),
      }),
    );
  });

  it("returns a failed result and fires onError when queuing throws", async () => {
    mockAddEvent.mockRejectedValueOnce(new Error("boom"));
    const errors: string[] = [];
    const tools = buildGbpTools({
      tenantId: "t",
      onQueued: () => {},
      onError: (_n, e) => { errors.push(e); },
    });
    const def = tools.update_business_hours as unknown as { execute: (a: unknown) => Promise<unknown> };
    const out = await def.execute({ hours: [{ day: "MONDAY", open: "09:00", close: "17:00" }] });
    expect(out).toMatchObject({ success: false, agentResultStatus: "failed" });
    expect(errors).toEqual(["boom"]);
  });
});
