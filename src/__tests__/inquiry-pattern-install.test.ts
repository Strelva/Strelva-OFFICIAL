import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), resolveVersion: vi.fn() }));
vi.mock("@/products/inquiries/portfolio", () => ({ resolveInquiryPattern: mocks.resolve, resolveInquiryPatternVersion: mocks.resolveVersion }));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/auth", () => ({ getTenantRole: async () => "owner", roleHasPermission: () => true }));
vi.mock("@/lib/connections", () => ({ getConnections: async () => [] }));
vi.mock("@/products/inquiries/email-consent", () => ({ projectInquiryEmailConnection: async () => ({ status: "not_configured" }) }));
vi.mock("@/products/inquiries/workspace-exit", () => ({
  assertInquiryWorkspaceOpen: vi.fn(async () => undefined),
}));
import { executeInquirySurface } from "@/products/inquiries/server";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { createInMemoryInquiryRepository } from "@/products/inquiries/repository";
import type { TenantConfig } from "@/lib/types";
import type { InquiryEngineState } from "@/products/inquiries/contracts";

const businessId = "22222222-2222-4222-8222-222222222222";
function context() {
  return { tenantId: "target", businessId, config: { id: "target", siteName: "Target Realty", active: true } as TenantConfig, repository: createInMemoryInquiryRepository() };
}

describe("cross-business pattern installation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("adapts the source brand and staff into an unpublished draft without inheriting consent", async () => {
    const engine = new InquiryEngine({ businessId: "11111111-1111-4111-8111-111111111111" });
    const initial = engine.start({ actorId: "source-owner", intent: "Collect seller inquiries", destination: "source@example.test" });
    const accepted = engine.acceptShape(initial.id, { actorId: "source-owner" });
    const definition = structuredClone(accepted.draft!);
    definition.form.title = "Contact Source Realty";
    definition.routing!.withinMinutes = 25;
    mocks.resolve.mockResolvedValue({ sourceBusinessName: "Source Realty", definition });
    const ctx = context();
    const result = await executeInquirySurface({ context: ctx, action: { kind: "use-pattern", patternId: "opaque-reference", businessId, destination: "target@example.test", actorId: "target-owner" }, expectedRevision: null, actorId: "target-owner" });
    expect(result.work?.draft?.form.title).toBe("Contact Target Realty");
    expect(result.work?.draft?.businessId).toBe(businessId);
    expect(result.work?.publishApproval).toBeNull();
    expect(result.work?.plan?.steps.length).toBeGreaterThan(0);
    expect(result.work?.draft?.routing?.sentence).toContain("25 minutes");
    expect(result.work?.draft?.connections.every((connection) => connection.consent === "missing")).toBe(true);
    expect(JSON.stringify(result.work?.draft?.routing)).toContain("target@example.test");
    const saved = await ctx.repository.getSnapshot("target", businessId);
    expect(saved?.state.capabilities.every((capability) => capability.live === null)).toBe(true);
    expect(saved?.state.responsibilities[0]?.trust).toBe("supervised");
  });
  it("does not persist a draft when source access was revoked or the source changed", async () => {
    mocks.resolve.mockResolvedValue(null);
    const ctx = context();
    await expect(executeInquirySurface({ context: ctx, action: { kind: "use-pattern", patternId: "stale-reference", businessId, actorId: "target-owner" }, expectedRevision: null, actorId: "target-owner" })).rejects.toThrow("no longer available");
    expect(await ctx.repository.getSnapshot("target", businessId)).toBeNull();
  });

  it("proposes and stages a newer source through the public commands", async () => {
    const sourceEngine = new InquiryEngine({ businessId: "source-business" });
    const sourceWork = sourceEngine.start({ actorId: "source-owner", intent: "Collect seller inquiries", destination: "source@example.test" });
    const sourceDraft = structuredClone(sourceEngine.acceptShape(sourceWork.id, { actorId: "source-owner" }).draft!);
    mocks.resolve.mockResolvedValue({ sourceBusinessName: "Source Realty", definition: sourceDraft });
    const ctx = context();
    const copied = await executeInquirySurface({ context: ctx, action: { kind: "use-pattern", patternId: "opaque-reference", businessId, destination: "target@example.test", actorId: "target-owner" }, expectedRevision: null, actorId: "target-owner" });
    const sourceUpdate = structuredClone(sourceDraft);
    sourceUpdate.version += 1;
    sourceUpdate.form.intro = "The updated seller explanation.";
    mocks.resolveVersion.mockResolvedValue({ sourceBusinessName: "Source Realty", definition: sourceUpdate });
    const proposed = await executeInquirySurface({ context: ctx, action: { kind: "propose-pattern-update", installationId: copied.snapshot.patternInstallations![0]!.id, capabilityId: copied.work!.capabilityId, actorId: "target-owner" }, expectedRevision: copied.snapshot.revision!, actorId: "target-owner" });
    expect(proposed.patternUpdate?.sourceVersion).toBe(2);
    expect(proposed.patternUpdate?.status).toBe("ready");
    const staged = await executeInquirySurface({ context: ctx, action: { kind: "stage-pattern-update", installationId: copied.snapshot.patternInstallations![0]!.id, capabilityId: copied.work!.capabilityId, sourceVersion: 2, resolutions: [], actorId: "target-owner" }, expectedRevision: proposed.snapshot.revision!, actorId: "target-owner" });
    expect(staged.work?.state).toBe("planned");
    expect(staged.work?.draft?.version).toBe(2);
    const durable = await ctx.repository.getSnapshot("target", businessId);
    expect((durable?.state as InquiryEngineState & { patternInstallations?: Array<{ pendingUpdate?: unknown }> }).patternInstallations?.[0]?.pendingUpdate).toBeDefined();
  });
});
