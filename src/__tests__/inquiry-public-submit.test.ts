import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InquiryCapabilityState } from "@/products/inquiries/contracts";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  legacy: vi.fn(),
  limited: vi.fn(),
  release: vi.fn(),
  snapshot: vi.fn(),
  tenant: vi.fn(),
  evidence: vi.fn(),
  workspace: vi.fn(),
  notice: vi.fn(),
  bookingOffer: vi.fn(),
}));

vi.mock("@/products/inquiries", async (original) => ({ ...(await original<typeof import("@/products/inquiries")>()), prepareInquiryBookingOffer: mocks.bookingOffer, notifyInquiryOwner: mocks.notice }));

vi.mock("@/products/inquiries/owner-notice", () => ({ notifyInquiryOwner: mocks.notice }));

vi.mock("@/lib/leads", () => ({ captureLead: mocks.capture, recordLead: mocks.legacy }));
vi.mock("@/platform/infra/rate-limit", () => ({
  isRateLimitedAsync: mocks.limited,
  rateLimitKey: () => "inquiry-submit-test",
}));
vi.mock("@/lib/lead-spam", () => ({
  scoreLeadSpam: () => ({ isSpam: false, score: 0, signals: [] }),
}));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant }));
vi.mock("@/products/inquiries/workspace-exit", () => ({
  INQUIRY_WORKSPACE_EXIT_CODE: "workspace_exit_future_work_blocked",
  InquiryWorkspaceExitUnavailableError: class InquiryWorkspaceExitUnavailableError extends Error {},
  resolveInquiryWorkspace: mocks.workspace,
}));
vi.mock("@/products/inquiries/server", async () => ({
  ...(await import("@/products/inquiries/workspace-exit")),
  getInquiryRepository: () => ({ getSnapshot: mocks.snapshot, compareAndSwap: vi.fn() }),
  inquiryReleaseEnabled: mocks.release,
  inquiryReleaseMayBeOn: (...args: unknown[]) => mocks.release(...args),
  inquiryReleasedForCurrentUser: async (...args: unknown[]) => mocks.release(...args),
  inquiryReleaseEnabledForTenant: async (...args: unknown[]) => mocks.release(...args),
  projectPublishedInquiry: (await import("@/products/inquiries/storefront")).projectPublishedInquiry,
  recordInquiryEvidence: mocks.evidence,
  validateInquiryFields: (await import("@/products/inquiries/inquiry-engine-operations")).validateInquiryFields,
}));

import { POST } from "@/app/api/v1/leads/[tenant]/route";

const time = "2026-09-11T12:00:00.000Z";
const capability: InquiryCapabilityState = {
  id: "cap-seller",
  businessId: "stable-business",
  status: "live",
  previousLive: null,
  activeRequestId: null,
  updatedAt: time,
  live: {
    id: "cap-seller",
    businessId: "stable-business",
    kind: "inquiry",
    version: 4,
    name: "Seller inquiry",
    createdAt: time,
    updatedAt: time,
    form: {
      id: "cap-seller:form",
      component: "form",
      title: "Tell us about your home",
      intro: "We will help with the next step.",
      disclosure: "Strelva",
      fields: [
        { id: "name", label: "Name", kind: "text", component: "text_field", required: true },
        { id: "email", label: "Email", kind: "email", component: "email_field", required: true },
        { id: "timeline", label: "Timeline", kind: "select", component: "select_field", required: true, options: ["Soon", "Exploring"] },
      ],
    },
    record: { component: "record_detail", type: "inquiry", singularLabel: "Seller inquiry", pluralLabel: "Seller inquiries", fields: [] },
    routing: null,
    followUp: null,
    connections: [],
  },
};

function request(body: Record<string, unknown>) {
  return POST(new Request("https://app.strelva.test/api/v1/leads/acme", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ tenant: "acme" }) });
}

function capabilityBody(overrides: Record<string, unknown> = {}) {
  return {
    source: "inquiry-capability",
    capabilityId: "cap-seller",
    capabilityVersion: 4,
    name: "Ada Rivera",
    email: "ada@example.test",
    fields: { name: "Ada Rivera", email: "ada@example.test", timeline: "Soon" },
    ...overrides,
  };
}

describe("public inquiry capability submission", () => {
  it("adds bookable times only when the handoff switch is on; offer failure never loses capture", async () => {
    const offer = { chooseUrl: "/inquiry-booking/fixture", slots: [{ label: "Friday 9 AM" }] };
    mocks.bookingOffer.mockResolvedValue(offer);
    const unchanged = await request(capabilityBody());
    expect(await unchanged.json()).toEqual({ ok: true });
    expect(mocks.bookingOffer).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_BOOKING_HANDOFF", "1");
    expect(await (await request(capabilityBody())).json()).toEqual({ ok: true, bookingOffer: offer });
    expect(mocks.bookingOffer).toHaveBeenCalledWith({ tenantId: "acme", inquiryId: "lead-1" });
    mocks.bookingOffer.mockRejectedValue(new Error("booking unavailable"));
    expect(await (await request(capabilityBody())).json()).toEqual({ ok: true });
  });
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capture.mockResolvedValue({ status: "captured", lead: { id: "lead-1", createdAt: time } });
    mocks.limited.mockResolvedValue(false);
    mocks.release.mockReturnValue(true);
    mocks.snapshot.mockResolvedValue({ state: { capabilities: [capability] } });
    mocks.tenant.mockResolvedValue({ active: true, stableId: "stable-business" });
    mocks.workspace.mockResolvedValue({ businessId: "stable-business", workspaceIds: [], exitCompleted: false });
    mocks.evidence.mockResolvedValue({ status: "recorded", receiptId: "receipt-1", timelineEventIds: ["event-1", "event-2"] });
    mocks.notice.mockResolvedValue({ status: "accepted" });
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "");
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "");
    vi.stubEnv("STRELVA_INQUIRY_BOOKING_HANDOFF", "");
  });

  it("keeps paused intake closed with the rollout off, and retains the exact published form with it on", async () => {
    mocks.snapshot.mockResolvedValue({ state: { capabilities: [{ ...capability, status: "paused" }] } });
    expect((await request(capabilityBody())).status).toBe(404);
    expect(mocks.capture).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    vi.stubEnv("DUAL_WRITE_PG", "1");
    expect((await request(capabilityBody())).status).toBe(200);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.notice).not.toHaveBeenCalled();
    expect(mocks.evidence).toHaveBeenCalledWith(expect.objectContaining({ expectedCapabilityVersion: 4 }));
    expect((await request(capabilityBody({ capabilityVersion: 3 }))).status).toBe(409);
  });

  it("notifies the owner immediately for paused intake only under the notice flag; notice failure never loses the lead", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    vi.stubEnv("DUAL_WRITE_PG", "1");
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
    mocks.snapshot.mockResolvedValue({ state: { capabilities: [{ ...capability, status: "paused" }] } });
    mocks.notice.mockRejectedValue(new Error("notice unavailable"));
    expect((await request(capabilityBody())).status).toBe(200);
    expect(mocks.notice).toHaveBeenCalledWith({ tenantId: "acme", lead: { id: "lead-1", createdAt: time } });
    expect(mocks.capture).toHaveBeenCalledWith("acme", expect.any(Object), { notifyOwner: false });
  });

  it("rejects new intake after the mapped customer workspace exits", async () => {
    mocks.workspace.mockResolvedValue({ businessId: "customer-workspace", workspaceIds: ["customer-workspace"], exitCompleted: true });

    const response = await request(capabilityBody());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "workspace_exit_future_work_blocked" });
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.evidence).not.toHaveBeenCalled();
  });

  it("persists the exact published capability version and structured fields", async () => {
    const response = await request(capabilityBody());

    expect(response.status).toBe(200);
    expect(mocks.snapshot).toHaveBeenCalledWith("acme", "stable-business");
    expect(mocks.capture).toHaveBeenCalledWith("acme", expect.objectContaining({
      capabilityId: "cap-seller",
      capabilityVersion: 4,
      fields: { name: "Ada Rivera", email: "ada@example.test", timeline: "Soon" },
      source: "inquiry-capability",
    }), { notifyOwner: false });
    expect(mocks.evidence).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "acme",
      businessId: "stable-business",
      inquiryId: "lead-1",
      capabilityId: "cap-seller",
      expectedCapabilityVersion: 4,
    }));
    expect(mocks.evidence).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "acme",
      businessId: "stable-business",
      inquiryId: "lead-1",
      capabilityId: "cap-seller",
      expectedCapabilityVersion: 4,
      fields: { name: "Ada Rivera", email: "ada@example.test", timeline: "Soon" },
      receivedAt: time,
    }));
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("reads the published capability from the mapped customer workspace", async () => {
    const mappedBusinessId = "customer-workspace";
    mocks.workspace.mockResolvedValue({ businessId: mappedBusinessId, workspaceIds: [mappedBusinessId], exitCompleted: false, mapped: true });
    mocks.snapshot.mockResolvedValue({
      state: {
        capabilities: [{
          ...capability,
          businessId: mappedBusinessId,
          live: { ...capability.live!, businessId: mappedBusinessId },
        }],
      },
    });

    const response = await request(capabilityBody());

    expect(response.status).toBe(200);
    expect(mocks.snapshot).toHaveBeenCalledWith("acme", mappedBusinessId);
    expect(mocks.evidence).toHaveBeenCalledWith(expect.objectContaining({ businessId: mappedBusinessId }));
  });

  it("rejects a stale rendered version before persistence", async () => {
    const response = await request(capabilityBody({ capabilityVersion: 3 }));

    expect(response.status).toBe(409);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("acknowledges a captured lead when the capability changes before receipt recording", async () => {
    mocks.evidence.mockResolvedValueOnce({ status: "stale", reason: "inquiry_capability_changed" });

    const response = await request(capabilityBody());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, pending: true });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ name: "Ada Rivera", email: "ada@example.test" }, "missing required field"],
    [{ name: "Ada Rivera", email: "ada@example.test", timeline: "Never offered" }, "invalid select option"],
    [{ name: "Ada Rivera", email: "ada@example.test", timeline: "Soon", privateRoute: "other@example.test" }, "unknown field"],
  ])("rejects malformed fixed-form fields: %s (%s)", async (fields, _label) => {
    const response = await request(capabilityBody({ fields }));

    expect(response.status).toBe(400);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("does not accept a capability definition from another business", async () => {
    mocks.snapshot.mockResolvedValue({ state: { capabilities: [{ ...capability, businessId: "another-business" }] } });

    const response = await request(capabilityBody());

    expect(response.status).toBe(404);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("reports unavailable persistence instead of a successful capture", async () => {
    mocks.capture.mockResolvedValue({ status: "unavailable" });

    const response = await request(capabilityBody());

    expect(response.status).toBe(503);
  });

  it("maps a capture write failure to an honest unavailable response", async () => {
    mocks.capture.mockRejectedValue(new Error("redis write failed"));

    const response = await request(capabilityBody());

    expect(response.status).toBe(503);
  });

  it("reports unavailable provenance and repairs it through the duplicate lead id", async () => {
    mocks.evidence.mockResolvedValueOnce({ status: "unavailable", reason: "workspace write unavailable" });

    const failed = await request(capabilityBody());

    expect(failed.status).toBe(503);
    mocks.capture.mockResolvedValue({ status: "duplicate", lead: { id: "lead-1", createdAt: time } });
    mocks.evidence.mockResolvedValue({ status: "already_recorded", receiptId: "receipt-1", timelineEventIds: ["event-1", "event-2"] });

    const retry = await request(capabilityBody());

    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true, duplicate: true });
    expect(mocks.evidence).toHaveBeenCalledTimes(2);
  });

  it("keeps capability submissions closed without the release gate", async () => {
    mocks.release.mockReturnValue(false);

    const response = await request(capabilityBody());

    expect(response.status).toBe(503);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("preserves the additive legacy lead contract", async () => {
    mocks.capture.mockResolvedValueOnce({ status: "captured", lead: { id: "lead_legacy" } });
    const response = await request({ name: "Legacy visitor", email: "legacy@example.test", source: "contact-form" });

    expect(response.status).toBe(200);
    // Same legacy input and default owner notice (no options argument).
    expect(mocks.capture).toHaveBeenCalledWith("acme", {
      name: "Legacy visitor",
      email: "legacy@example.test",
      message: undefined,
      source: "contact-form",
    });
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("answers 503 on the legacy path when no store confirmed the lead", async () => {
    mocks.capture.mockResolvedValueOnce({ status: "unavailable", mirrored: false });
    const response = await request({ name: "Legacy visitor", email: "legacy@example.test", source: "contact-form" });
    expect(response.status).toBe(503);
    mocks.capture.mockResolvedValueOnce({ status: "unavailable", mirrored: true });
    expect((await request({ name: "Legacy visitor", email: "legacy@example.test", source: "contact-form" })).status).toBe(200);
  });

  it("keeps a legacy form with extra fields on the legacy owner-notice path", async () => {
    mocks.capture.mockResolvedValueOnce({ status: "captured", lead: { id: "lead_legacy" } });
    const response = await request({
      name: "Legacy visitor",
      email: "legacy@example.test",
      source: "contact-form",
      fields: { company: "Legacy Co" },
    });

    expect(response.status).toBe(200);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith("acme", {
      name: "Legacy visitor",
      email: "legacy@example.test",
      message: undefined,
      source: "contact-form",
    });
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
