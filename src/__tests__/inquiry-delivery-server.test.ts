import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";
import type { InquiryEngineState } from "@/products/inquiries/contracts";
import type { InquiryDeliveryTimelineInput } from "@/products/inquiries/delivery-types";
import {
  createInMemoryInquiryRepository,
  setInquiryRepositoryForTests,
} from "@/products/inquiries/repository";
import { executeInquirySurface } from "@/products/inquiries/server";
import type { TenantConfig } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  redis: vi.fn(() => ({})),
  leads: vi.fn(),
  role: vi.fn(async () => "owner"),
  hasPermission: vi.fn(() => true),
  deliveryEvents: [] as InquiryDeliveryTimelineInput[],
  deliveryStore: {
    durable: true,
    atomicBudget: true,
    listTimeline: vi.fn(async (input: { tenantId: string; inquiryId: string }) => mocks.deliveryEvents.filter((event) => event.tenantId === input.tenantId && event.inquiryId === input.inquiryId)),
  },
}));

vi.mock("@/lib/redis", () => ({ getRedis: mocks.redis }));
vi.mock("@/lib/leads", () => ({ getLeads: mocks.leads }));
vi.mock("@/lib/auth", () => ({ getTenantRole: mocks.role, roleHasPermission: mocks.hasPermission }));
vi.mock("@/products/inquiries/delivery-store", () => ({ createRedisInquiryDeliveryStore: () => mocks.deliveryStore }));
vi.mock("@/products/inquiries/workspace-exit", () => ({
  assertInquiryWorkspaceOpen: vi.fn(async () => undefined),
}));

const TENANT_ID = "tenant-a";
const BUSINESS_ID = "buffalo-realty";
const CONFIG = {
  id: TENANT_ID,
  subdomain: TENANT_ID,
  siteName: "Buffalo Realty",
  ownerName: "Owner",
  industry: "real-estate",
  active: true,
  createdAt: "2026-09-11T00:00:00.000Z",
  template: "food-brand",
} as TenantConfig;

async function publishedFixture(): Promise<{ state: InquiryEngineState; inquiryId: string; capabilityId: string }> {
  const adapter = createPreviewInquiryAdapter();
  const requestId = adapter.getSnapshot().state.requests[0]!.id;
  await adapter.execute({ kind: "accept-shape", requestId, input: { actorId: "fixture-owner" } });
  await adapter.execute({ kind: "rehearse", requestId, actorId: "fixture-owner" });
  await adapter.execute({ kind: "publish", requestId, actorId: "fixture-owner" });
  const capabilityId = adapter.getSnapshot().state.capabilities[0]!.id;
  const received = await adapter.execute({
    kind: "simulate-inquiry",
    capabilityId,
    actorId: "fixture-owner",
    fields: { name: "Avery Buyer", email: "avery@example.test", message: "Please call me." },
  });
  return { state: adapter.getSnapshot().state, inquiryId: received.record!.id, capabilityId };
}

describe("server delivery projection and Why operation", () => {
  let restoreRepository: (() => void) | undefined;

  beforeEach(() => {
    mocks.deliveryEvents = [];
    mocks.deliveryStore.listTimeline.mockClear();
    mocks.redis.mockReturnValue({});
    mocks.role.mockResolvedValue("owner");
    mocks.hasPermission.mockReturnValue(true);
  });

  afterEach(() => {
    restoreRepository?.();
    restoreRepository = undefined;
  });

  it("uses provider evidence for Why while saving only canonical engine state", async () => {
    const fixture = await publishedFixture();
    const record = fixture.state.inquiries.find((item) => item.id === fixture.inquiryId)!;
    mocks.leads.mockResolvedValue([{
      id: record.id,
      name: "Avery Buyer",
      email: "avery@example.test",
      message: "Please call me.",
      fields: record.fields,
      capabilityId: fixture.capabilityId,
      capabilityVersion: record.capabilityVersion,
      createdAt: record.receivedAt,
    }]);
    mocks.deliveryEvents.push({
      tenantId: TENANT_ID,
      inquiryId: fixture.inquiryId,
      capabilityId: fixture.capabilityId,
      type: "notification_bounced",
      summary: "Provider delivery update: bounced.",
      outcome: "failed",
      at: "2026-09-11T15:00:00.000Z",
      actor: { kind: "system", id: "resend-webhook", label: "Resend" },
      evidence: ["Resend reported a permanent bounce."],
    });

    const repository = createInMemoryInquiryRepository();
    restoreRepository = setInquiryRepositoryForTests(repository);
    const seeded = await repository.compareAndSwap({ tenantId: TENANT_ID, businessId: BUSINESS_ID, expectedRevision: null, state: fixture.state });
    expect(seeded.changed).toBe(true);

    const result = await executeInquirySurface({
      context: { tenantId: TENANT_ID, businessId: BUSINESS_ID, config: CONFIG, repository },
      action: { kind: "fix-why", requestId: fixture.inquiryId, path: "routing.destination", actorId: "owner-1" },
      expectedRevision: 1,
      actorId: "owner-1",
    });

    expect(result.why?.fix).toMatchObject({ targetPath: "routing.destination", title: "Fix the notification address" });
    expect(result.snapshot.deliveryEvidence).toEqual({ available: true, reason: null });
    expect(result.snapshot.state.inquiries.find((item) => item.id === fixture.inquiryId)?.status).toBe("blocked");
    expect(result.snapshot.whyByInquiry?.[fixture.inquiryId]?.summary).toContain("Provider delivery update: bounced.");
    expect(result.snapshot.whyByInquiry?.[fixture.inquiryId]?.fix?.targetPath).toBe("routing.destination");

    const saved = await repository.getSnapshot(TENANT_ID, BUSINESS_ID);
    expect(saved?.state.inquiries).toEqual([]);
    expect(saved?.state.timeline.some((event) => event.id.startsWith("delivery_"))).toBe(false);
    expect(saved?.state.requests.some((request) => request.intent.includes("Fix the notification address"))).toBe(true);
  });
});
