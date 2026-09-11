import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InquiryCapabilityState } from "@/products/inquiries/contracts";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  legacy: vi.fn(),
  limited: vi.fn(),
  release: vi.fn(),
  snapshot: vi.fn(),
  tenant: vi.fn(),
  evidence: vi.fn(),
}));

vi.mock("@/lib/leads", () => ({ captureLead: mocks.capture, recordLead: mocks.legacy }));
vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedAsync: mocks.limited,
  rateLimitKey: () => "inquiry-submit-test",
}));
vi.mock("@/lib/lead-spam", () => ({
  scoreLeadSpam: () => ({ isSpam: false, score: 0, signals: [] }),
}));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant }));
vi.mock("@/products/inquiries/server", async () => ({
  getInquiryRepository: () => ({ getSnapshot: mocks.snapshot, compareAndSwap: vi.fn() }),
  inquiryReleaseEnabled: mocks.release,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capture.mockResolvedValue({ status: "captured", lead: { id: "lead-1", createdAt: time } });
    mocks.limited.mockResolvedValue(false);
    mocks.release.mockReturnValue(true);
    mocks.snapshot.mockResolvedValue({ state: { capabilities: [capability] } });
    mocks.tenant.mockResolvedValue({ active: true, stableId: "stable-business" });
    mocks.evidence.mockResolvedValue({ status: "recorded", receiptId: "receipt-1", timelineEventIds: ["event-1", "event-2"] });
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
    const response = await request({ name: "Legacy visitor", email: "legacy@example.test", source: "contact-form" });

    expect(response.status).toBe(200);
    expect(mocks.legacy).toHaveBeenCalledWith("acme", {
      name: "Legacy visitor",
      email: "legacy@example.test",
      message: undefined,
      source: "contact-form",
    });
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("keeps a legacy form with extra fields on the legacy owner-notice path", async () => {
    const response = await request({
      name: "Legacy visitor",
      email: "legacy@example.test",
      source: "contact-form",
      fields: { company: "Legacy Co" },
    });

    expect(response.status).toBe(200);
    expect(mocks.legacy).toHaveBeenCalledWith("acme", {
      name: "Legacy visitor",
      email: "legacy@example.test",
      message: undefined,
      source: "contact-form",
    });
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
