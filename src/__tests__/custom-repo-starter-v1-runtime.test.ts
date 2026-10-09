/** Real starter → route → application seam, with fictional local persistence/providers.
 * No HTTP server, Auth, database or outside provider is involved. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V1_ROUTE_CONTRACTS } from "../../scripts/custom-repo-v1-contracts";
import { loadInquiryForm, type PublicInquiryForm } from "../../custom-repo-starter/inquiry-client";
import { cancelBooking, changeBooking, loadBookingSchedule, readBookingStatus, reserveBooking } from "../../custom-repo-starter/booking-client";
import { fetchScaffoldCollection, fetchScaffoldEntry } from "../../custom-repo-starter/scaffold-client";
import { createPublicBookingService, PublicBookingError, type PublicBookingBinding, type PublicBookingCalendarConfirmation, type PublicBookingReservationRef } from "@/products/scheduling/public-booking";
import { recoverPublicWebsiteBooking } from "@/products/scheduling/public-booking-recovery";
import { projectPublishedInquiry } from "@/products/inquiries/storefront";
import type { InquiryCapabilityState } from "@/products/inquiries/contracts";
import { signPreviewToken } from "@/lib/scaffold-contracts";

const ports = vi.hoisted(() => ({
  service: vi.fn(), recover: vi.fn(), tenant: vi.fn(), snapshot: vi.fn(), release: vi.fn(), workspace: vi.fn(),
  list: vi.fn(), entry: vi.fn(), limited: vi.fn(), readLimit: vi.fn(),
}));
vi.mock("@/products/scheduling/server", async () => ({
  ...(await import("@/products/scheduling/public-booking")),
  createPublicWebsiteBookingService: ports.service, recoverPublicWebsiteBooking: ports.recover,
}));
vi.mock("@/products/inquiries/server", async () => ({
  projectPublishedInquiry: (await import("@/products/inquiries/storefront")).projectPublishedInquiry,
  getInquiryRepository: () => ({ getSnapshot: ports.snapshot }),
  inquiryReleaseMayBeOn: ports.release, inquiryReleaseEnabledForTenant: ports.release,
  resolveInquiryWorkspace: ports.workspace, INQUIRY_WORKSPACE_EXIT_CODE: "workspace_exit_completed",
}));
vi.mock("@/products/inquiries", () => ({ inquiryDefinitionAtUse: async (_tenant: string, definition: unknown) => definition }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: ports.tenant }));
vi.mock("@/platform/infra/db/repositories", () => ({ listEntries: ports.list, getEntryBySlug: ports.entry }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: ports.limited, rateLimitKey: () => "fixture" }));
vi.mock("@/platform/bookings/public-read", () => ({ limitPublicBookingRead: ports.readLimit }));
vi.mock("@/platform/bookings/native", () => ({ agentBookingSchema: { safeParse: () => ({ success: false }) } }));
vi.mock("@/platform/bookings/flags", () => ({ bookingReadSource: async () => "redis" }));
vi.mock("@/platform/bookings/updates", () => ({ deliverBookingUpdates: vi.fn() }));
vi.mock("@/platform/agent-channel/limits", () => ({ agentIdentityLimitsEnabled: () => false }));

import { GET as INQUIRY_GET } from "@/app/api/v1/inquiries/[tenant]/route";
import { GET as BOOKING_GET } from "@/app/api/v1/bookings/[tenant]/route";
import { POST as RESERVE_POST } from "@/app/api/v1/bookings/[tenant]/reservations/route";
import { PATCH as CHANGE_PATCH, DELETE as CANCEL_DELETE } from "@/app/api/v1/bookings/[tenant]/reservations/[reservationId]/route";
import { POST as READBACK_POST } from "@/app/api/v1/bookings/[tenant]/reservations/[reservationId]/readback/route";
import { GET as COLLECTION_GET } from "@/app/api/v1/collections/[tenant]/[type]/route";
import { GET as ENTRY_GET } from "@/app/api/v1/collections/[tenant]/[type]/[slug]/route";

const base = "https://control.example.test";
const tenant = "fictional";
const secret = "fictional-preview-secret";
const requestId = "request-abcdefghijklmnopqrstuvwxyz123456";
const visitor = { name: "Avery Buyer", email: "avery@example.test" };
const range = { from: "2026-10-01T00:00:00Z", to: "2026-10-08T00:00:00Z" };
const binding: PublicBookingBinding = {
  tenantId: tenant, capabilityId: "consultation", version: 2, name: "Consultation", provider: "outlook", timeZone: "America/New_York",
  slots: [{ id: "slot-abcdefgh", start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" },
    { id: "slot-ijklmnop", start: "2026-10-01T14:00:00Z", end: "2026-10-01T15:00:00Z" }],
  owner: { userId: "owner-private", verifiedEmail: "owner@example.test" }, workspaceId: "workspace-private", workId: "work-private",
};
const form: PublicInquiryForm = {
  schemaVersion: 1, capabilityId: "contact", version: 3, name: "Contact",
  form: { component: "form", id: "contact-form", title: "Contact us", intro: "Tell us what you need", disclosure: "Strelva",
    fields: [{ id: "name", label: "Your name", kind: "text", component: "text_field", required: true }] },
};
const capability: InquiryCapabilityState = { id: form.capabilityId, businessId: "business-private", status: "live", previousLive: null, activeRequestId: null, updatedAt: range.from, live: {
  kind: "inquiry", id: form.capabilityId, businessId: "business-private", version: form.version, name: form.name, form: form.form,
  record: { component: "record_list", type: "inquiry", singularLabel: "Inquiry", pluralLabel: "Inquiries", fields: form.form.fields },
  routing: null, followUp: null, connections: [], createdAt: range.from, updatedAt: range.from,
} };
const row = { id: "row-private", tenant_id: tenant, type: "blog", slug: "hello", status: "published", data: { title: "Hello" },
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" };

function fixture() {
  const refs = new Map<string, PublicBookingReservationRef>();
  const tokens = {
    findByRequest: vi.fn(async (input: { tenantId: string; requestId: string }) => [...refs.values()].find(ref => ref.tenantId === input.tenantId && ref.requestId === input.requestId) ?? null),
    findByToken: vi.fn(async (input: { tenantId: string; managementToken: string }) => refs.get(`${input.tenantId}:${input.managementToken}`) ?? null),
    save: vi.fn(async (ref: PublicBookingReservationRef) => { refs.set(`${ref.tenantId}:${ref.managementToken}`, ref); return ref; }),
  };
  const inquiries = { capture: vi.fn(async () => ({ inquiryId: "inquiry-private" })) };
  const calendar = {
    reserve: vi.fn(async (): Promise<PublicBookingCalendarConfirmation> => ({ verification: "verified", start: binding.slots[0]!.start, end: binding.slots[0]!.end, expectedRevision: 1 })),
    change: vi.fn(async (input: { start: string; end: string; expectedRevision: number }) => ({ verification: "verified" as const, start: input.start, end: input.end, expectedRevision: input.expectedRevision + 1 })),
    cancel: vi.fn(async () => ({ verification: "verified" as const, start: binding.slots[0]!.start, end: binding.slots[0]!.end, expectedRevision: 3 })),
    read: vi.fn(), recover: vi.fn(),
  };
  const resolve = vi.fn(async () => binding);
  let serial = 0;
  const service = createPublicBookingService({ resolve, tokens, inquiries, calendar,
    createReservationId: () => `reservation-abcdefgh-${++serial}`, createManagementToken: () => `management-abcdefgh-${serial}`, createRequestId: () => "legacy-abcdefghijklmnopqrstuvwxyz123456" });
  ports.service.mockReturnValue(service);
  ports.recover.mockImplementation(input => recoverPublicWebsiteBooking(input, { resolve, tokens, calendar, admission: { verified: async () => false } }));
  return { service, tokens, inquiries, calendar, resolve, refs };
}
let f: ReturnType<typeof fixture>;
const observed: Array<{ key: string; request: Request; response: Response }> = [];

// One transport dispatches actual handlers. An unknown path/method fails the fixture.
async function transport(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const evidenceRequest = request.clone();
  const parts = new URL(request.url).pathname.split("/").slice(3);
  const [resource, requestTenant, type, id, suffix] = parts;
  const ctx = { params: Promise.resolve({ tenant: requestTenant!, reservationId: id!, type: type!, slug: id! }) };
  let response: Response;
  let key: string;
  if (resource === "inquiries") { key = "inquiries"; response = await INQUIRY_GET(request, ctx); }
  else if (resource === "collections") {
    key = id ? "collections-entry" : "collections";
    response = await (id ? ENTRY_GET : COLLECTION_GET)(request, ctx);
  } else if (resource === "bookings") {
    if (!type) { key = "bookings"; response = await BOOKING_GET(request, ctx); }
    else if (!id && request.method === "POST") { key = "bookings-reservations"; response = await RESERVE_POST(request, ctx); }
    else if (suffix === "readback" && request.method === "POST") { key = "bookings-readback"; response = await READBACK_POST(request, ctx); }
    else if (request.method === "PATCH") { key = "bookings-change"; response = await CHANGE_PATCH(request, ctx); }
    else if (request.method === "DELETE") { key = "bookings-cancel"; response = await CANCEL_DELETE(request, ctx); }
    else throw new Error(`Unexpected fixture request: ${request.method} ${request.url}`);
  } else throw new Error(`Unexpected fixture resource: ${resource}`);
  expect(request.method).toBe(V1_ROUTE_CONTRACTS[key]!.method);
  observed.push({ key, request: evidenceRequest, response: response.clone() });
  return response;
}
const reserve = (options: { requestId?: string } = { requestId }) => reserveBooking(base, tenant, { capabilityId: binding.capabilityId, version: binding.version }, binding.slots[0]!, visitor, options);
const raw = (key: string, body?: Record<string, unknown>) => {
  const contract = V1_ROUTE_CONTRACTS[key]!;
  const url = (contract.pathTemplate ?? `/api/v1/${key}/{tenant}`).replace("{tenant}", tenant).replace("{reservationId}", "reservation-abcdefgh");
  return transport(base + url, { method: contract.method, ...(body ? { body: JSON.stringify(body) } : {}) });
};
beforeEach(() => {
  vi.resetAllMocks(); observed.length = 0; f = fixture();
  ports.limited.mockResolvedValue(false); ports.readLimit.mockResolvedValue(undefined);
  ports.release.mockReturnValue(true); ports.tenant.mockResolvedValue({ active: true, stableId: "business-private", revalidationSecret: secret });
  ports.workspace.mockResolvedValue({ businessId: "business-private", exitCompleted: false });
  ports.snapshot.mockResolvedValue({ state: { capabilities: [capability] } });
  ports.list.mockResolvedValue([row]); ports.entry.mockResolvedValue(row);
  vi.stubEnv("TENANT_ID", tenant); vi.stubEnv("SCAFFOLD_API_URL", base); vi.stubEnv("REVALIDATION_SECRET", secret);
  vi.stubGlobal("fetch", vi.fn(transport));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("starter inquiry/booking/collection v1 interoperability", () => {
  it("loads the real public inquiry projection with no private business or routing data", async () => {
    expect(projectPublishedInquiry(capability)).toEqual(form);
    expect(await loadInquiryForm(base, tenant, form.capabilityId)).toEqual(form);
    expect(ports.snapshot).toHaveBeenCalledWith(tenant, "business-private");
    expect(await observed[0]!.response.text()).not.toContain("business-private");
  });
  it("composes all booking verbs with the real service and starter guards", async () => {
    const schedule = await loadBookingSchedule(base, tenant, binding.capabilityId, range);
    const receipt = await reserve();
    expect(receipt.status).toBe("confirmed");
    expect((await readBookingStatus(base, tenant, receipt)).status).toBe("confirmed");
    expect((await changeBooking(base, tenant, receipt, schedule.slots[1]!)).start).toBe(binding.slots[1]!.start);
    expect((await cancelBooking(base, tenant, receipt)).status).toBe("cancelled");
    expect(observed.map(x => x.key)).toEqual(["bookings", "bookings-reservations", "bookings-readback", "bookings-change", "bookings-cancel"]);
    for (const item of observed) {
      expect(V1_ROUTE_CONTRACTS[item.key]!.successStatuses).toContain(item.response.status);
      expect(item.request.headers.get("authorization")).toBeNull();
      expect(await item.response.clone().text()).not.toMatch(/workspace-private|work-private|owner-private/);
    }
    const call = vi.mocked(fetch).mock.calls[2]!;
    expect(call[1]?.credentials).toBe("omit");
    expect(JSON.parse(String(call[1]?.body))).toEqual({ managementToken: receipt.managementToken });
  });
  it("preserves old reservations without a requestId and replays a caller key without another calendar write", async () => {
    const first = await reserve();
    expect(await reserve()).toEqual(first);
    expect(f.calendar.reserve).toHaveBeenCalledTimes(1);
    expect(f.inquiries.capture).toHaveBeenCalledTimes(1);
    const legacy = await reserve({});
    expect(legacy.status).toBe("confirmed");
    expect(legacy.reservationId).not.toBe(first.reservationId);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)![1]?.body))).not.toHaveProperty("requestId");
    expect(f.calendar.reserve).toHaveBeenCalledTimes(2);
    await expect(reserveBooking(base, tenant, { capabilityId: binding.capabilityId, version: 2 }, binding.slots[1]!, visitor, { requestId })).rejects.toThrow(/different|already/);
    expect(observed.at(-1)!.response.status).toBe(409);
    expect(f.calendar.reserve).toHaveBeenCalledTimes(2);
  });
  it("leaves pending readback pending without a provider write or an invented confirmation", async () => {
    f.calendar.reserve.mockResolvedValueOnce({ verification: "pending", start: binding.slots[0]!.start, end: binding.slots[0]!.end, expectedRevision: 1 });
    const pending = await reserve(); expect(pending.status).toBe("pending");
    expect((await readBookingStatus(base, tenant, pending)).status).toBe("pending");
    expect(f.calendar.reserve).toHaveBeenCalledTimes(1); expect(f.calendar.recover).not.toHaveBeenCalled();
  });
  it("retains old inquiry parsing and supported optional booking additions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const response = await transport(input, init); const body = await response.json();
      const key = observed.at(-1)!.key;
      if (key === "inquiries") body.optionalMetadata = { version: 1 };
      if (key === "bookings") { body.intake = []; body.bookingAuthority = "business"; }
      return Response.json(body, { status: response.status });
    }));
    expect((await loadInquiryForm(base, tenant, form.capabilityId)).capabilityId).toBe(form.capabilityId);
    expect((await loadBookingSchedule(base, tenant, binding.capabilityId, range)).bookingAuthority).toBe("business");
  });
  it("supports receipt envelope additions, but detects required-field removal", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const response = await transport(input, init); const body = await response.json();
      if (observed.at(-1)!.key === "bookings-reservations") return Response.json({ receipt: body, advisory: "optional envelope metadata" }, { status: response.status });
      return Response.json(body, { status: response.status });
    }));
    expect((await reserve()).status).toBe("confirmed");
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const response = await transport(input, init); const body = await response.json();
      delete body.managementToken; // deliberately incompatible producer mutation
      return Response.json(body, { status: response.status });
    }));
    await expect(reserve()).rejects.toThrow(/incomplete receipt/);
  });
  it("preserves the public collection wire shape and starter fallbacks", async () => {
    const entries = await fetchScaffoldCollection("blog"); const entry = await fetchScaffoldEntry("blog", "hello");
    expect(entries).toEqual([entry]); expect(entry).toEqual({ slug: row.slug, type: row.type, status: row.status, data: row.data, createdAt: row.created_at, updatedAt: row.updated_at });
    for (const { response } of observed) expect(response.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    ports.tenant.mockResolvedValue(null);
    expect(await fetchScaffoldCollection("blog")).toEqual([]); expect(await fetchScaffoldEntry("blog", "hello")).toBeNull();
    expect(observed.at(-1)!.response.status).toBe(404);
  });
  it("a signed starter preview reads drafts; missing, wrong, stale or cross-tenant signatures degrade to published", async () => {
    await fetchScaffoldCollection("blog", { preview: true });
    expect(ports.list).toHaveBeenLastCalledWith(tenant, "blog", undefined);
    for (const token of [null, signPreviewToken(tenant, "wrong-secret"), signPreviewToken(tenant, secret, String(Date.now() - 600_000)), signPreviewToken("other", secret)]) {
      const headers = token ? { "x-scaffold-preview-ts": token.timestamp, "x-scaffold-preview-sig": token.signature } : undefined;
      await transport(`${base}/api/v1/collections/${tenant}/blog?preview=true`, { headers });
      expect(ports.list).toHaveBeenLastCalledWith(tenant, "blog", { status: "published" });
    }
    ports.entry.mockResolvedValue({ ...row, status: "draft" });
    expect((await transport(`${base}/api/v1/collections/${tenant}/blog/hello?preview=true`)).status).toBe(404);
    expect((await fetchScaffoldEntry("blog", "hello", { preview: true }))?.status).toBe("draft");
  });
});

describe("stable refusal and failure behavior", () => {
  it.each(["bookings-reservations", "bookings-change", "bookings-cancel", "bookings-readback"])("%s rejects missing fields before an application write", async key => {
    expect((await raw(key, {})).status).toBe(400);
    expect(f.calendar.reserve).not.toHaveBeenCalled(); expect(f.calendar.change).not.toHaveBeenCalled(); expect(f.calendar.cancel).not.toHaveBeenCalled(); expect(ports.recover).not.toHaveBeenCalled();
  });
  it.each(["bookings-change", "bookings-cancel", "bookings-readback"])("%s refuses an unknown management token", async key => {
    await reserve();
    const body = { managementToken: "unknown-token-abcdefgh", capabilityId: binding.capabilityId, capabilityVersion: binding.version, slotId: binding.slots[1]!.id };
    expect((await raw(key, body)).status).toBe(404);
    expect(f.calendar.change).not.toHaveBeenCalled(); expect(f.calendar.cancel).not.toHaveBeenCalled(); expect(f.calendar.recover).not.toHaveBeenCalled();
  });
  it("tenant-bound replay/readback do not disclose a receipt to another tenant", async () => {
    const receipt = await reserve();
    await expect(readBookingStatus(base, "other", receipt)).rejects.toThrow();
    expect(observed.at(-1)!.response.status).toBe(404);
  });
  it("malformed JSON, bad range and missing capability return 400", async () => {
    expect((await transport(`${base}/api/v1/bookings/${tenant}/reservations`, { method: "POST", body: "{" })).status).toBe(400);
    expect((await transport(`${base}/api/v1/bookings/${tenant}?capabilityId=consultation&from=bad&to=bad`)).status).toBe(400);
    expect((await raw("bookings")).status).toBe(400); expect((await raw("inquiries")).status).toBe(400);
  });
  it("inquiry release off, missing tenant, exit and failed storage remain distinct refusals", async () => {
    ports.release.mockReturnValue(false); await expect(loadInquiryForm(base, tenant, "contact")).rejects.toThrow(); expect(observed.at(-1)!.response.status).toBe(503);
    ports.release.mockReturnValue(true); ports.tenant.mockResolvedValue(null); await expect(loadInquiryForm(base, tenant, "contact")).rejects.toThrow(); expect(observed.at(-1)!.response.status).toBe(404);
    ports.tenant.mockResolvedValue({ active: true }); ports.workspace.mockResolvedValue({ exitCompleted: true }); await expect(loadInquiryForm(base, tenant, "contact")).rejects.toThrow(); expect(observed.at(-1)!.response.status).toBe(409);
    ports.workspace.mockRejectedValue(new Error("fictional failure")); await expect(loadInquiryForm(base, tenant, "contact")).rejects.toThrow(); expect(observed.at(-1)!.response.status).toBe(503);
  });
  it("limiter and receipt-store failures never call the calendar", async () => {
    ports.limited.mockResolvedValueOnce(true); await expect(reserve()).rejects.toThrow(); expect(observed.at(-1)!.response.status).toBe(429);
    f.tokens.findByRequest.mockRejectedValueOnce(new Error("fictional storage failure")); await expect(reserve()).rejects.toThrow(); expect(observed.at(-1)!.response.status).toBe(503);
    expect(f.calendar.reserve).not.toHaveBeenCalled();
  });
  it("a typed booking refusal preserves status and code", async () => {
    ports.service.mockReturnValue({ read: async () => { throw new PublicBookingError("not_found", "Unavailable"); } });
    await expect(loadBookingSchedule(base, tenant, binding.capabilityId, range)).rejects.toThrow("Unavailable");
    expect(observed.at(-1)!.response.status).toBe(404); expect(await observed.at(-1)!.response.json()).toEqual({ error: "Unavailable", code: "not_found" });
  });
  it("collection failures retain []/null fallbacks and 500 statuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    ports.list.mockRejectedValue(new Error("fictional storage failure")); ports.entry.mockRejectedValue(new Error("fictional storage failure"));
    expect(await fetchScaffoldCollection("blog")).toEqual([]); expect(await fetchScaffoldEntry("blog", "hello")).toBeNull();
    expect(observed.map(x => x.response.status)).toEqual([500, 500]);
    vi.restoreAllMocks();
  });
});
