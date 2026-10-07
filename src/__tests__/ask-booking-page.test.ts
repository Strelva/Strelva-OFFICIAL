import { describe, expect, it, vi } from "vitest";
import { prepareExistingAskBookingPage } from "@/app/api/workspace/ask/booking-possibility-server";
import { createWebsiteRebuildService } from "@/products/websites/rebuild-service";
import { composeAskPageSet } from "@/products/websites/ask-page-set";
import { siteDocumentHash } from "@/products/websites/site-document";
import { websiteRebuildSchema, type WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import type { WebsiteDocumentStore, WebsiteDocumentRevision } from "@/products/websites/document-store";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import type { SavedWork } from "@/platform/workspaces/types";
import type { SystemListing } from "@/platform/systems/from-existing";
import { AskPossibilityUnsupportedError, createPossibilityAdapter, type AskPossibilityInput } from "@/platform/ask/ports";
import { createInMemoryPossibilityRepository } from "@/platform/possibilities";
import type { CalendarConnection } from "@/products/scheduling/contracts";
import { syncAskPageSetPossibilities } from "@/experience/systems/stored-possibilities";
import { possibilityTryState } from "@/experience/systems/try-state";
import { signPossibilityPreviewToken } from "@/platform/possibilities/preview-link";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const systemId = "33333333-3333-4333-8333-333333333333";
const grantId = "44444444-4444-4444-8444-444444444444";
const stableId = "55555555-5555-4555-8555-555555555555";
const scheduleId = "66666666-6666-4666-8666-666666666666";
const actor = { userId: "owner", verifiedEmail: "owner@example.test" };
const time = "2026-10-07T12:00:00.000Z";
const input: AskPossibilityInput = { workspaceId, systemId, title: "Booking page", intent: "Add a page for our configured booking service", words: "Add a booking page using our current consulting service", origin: "owner_interpreted", introduces: { key: "booking-page", name: "Booking page", purpose: "Expose the existing booking service", summary: "A new page for the current booking service" }, candidate: { kind: "existing-booking-page", path: "/book", title: "Book a time", description: "Choose a time with our team" }, check: "Try a test booking" };
function native() {
  const document = composeAskPageSet("Example", { kind: "website-pages", pages: [{ path: "/", title: "Home", description: "Existing home", paragraphs: ["Existing home content"] }] }).document;
  Object.values(document.nodes).forEach(node => { if (node.verification) node.verification = { supported: true, confidence: 1, needsReview: false }; });
  const hash = siteDocumentHash(document);
  return { workspaceId, workId, rebuild: websiteRebuildSchema.parse({ version: 2, revision: 4, title: "Example", input: { requestId: "native-published", businessName: "Example", description: "Existing site" }, status: "published", stages: [], checkpoint: null, sourceAudit: null, audit: null, pageMapping: [], candidate: { revision: 1, contentHash: hash, document, previewHref: `/api/websites/${workId}/preview?revision=1&contentHash=${hash}` }, approvedCandidateRevision: 1, tenantId: "example", launch: { receipt: null, readBack: null }, lastError: null, createdBy: actor.userId, createdAt: time, history: [] }) };
}
function harness() {
  const record = native();
  const site = { system: { id: systemId, businessId: workspaceId, kind: "website", currentRevision: { businessId: workspaceId, systemId, revisionId: grantId, number: 3 } }, provenance: "stored", references: { savedWorkId: workId, tenantId: "example", tenantStableId: stableId } } as SystemListing;
  const options = { tenants: [{ tenantId: "example", siteName: "Example", inquiry: [{ capabilityId: "consult-inquiries", version: 2, name: "Consult inquiries" }], booking: [{ grantId, capabilityId: "consult", version: 3, name: "Consulting", provider: "google" as const, range: { from: "2026-10-10T12:00:00.000Z", to: "2026-10-10T13:00:00.000Z" } }] }] };
  const prepare = vi.fn(async (): Promise<WebsiteRebuildRecord> => ({ ...record, rebuild: { ...record.rebuild, status: "review_ready", candidate: { ...record.rebuild.candidate!, revision: 2 } } }));
  const calendars: CalendarConnection[] = [{ id: grantId, workspaceId, provider: "google", status: "connected", timeZone: "UTC", calendarId: "configured", calendarName: "Consulting", scopes: ["https://www.googleapis.com/auth/calendar"], reminderPolicy: { mode: "off" }, tokenExpiresAt: null, lastCheckedAt: null, lastError: null, createdAt: time, updatedAt: time }];
  const deps = { released: async () => true, target: vi.fn(async () => site), read: vi.fn(async () => record), options: vi.fn(async () => options), grants: vi.fn(async () => [{ id: grantId, tenant_stable_id: stableId, work_id: scheduleId, status: "published", capability_id: "consult", capability_version: 3, inquiry_capability_id: "consult-inquiries", inquiry_version: 2, provider: "google", display_name: "Consulting", time_zone: "UTC" }]), calendars: vi.fn(async () => calendars), schedule: vi.fn(async () => ({ workspaceId, payload: { availability: [{ start: "2026-10-10T12:00:00.000Z", end: "2026-10-10T13:00:00.000Z" }], reservations: [] } } as never)), prepare, now: () => Date.parse(time) };
  return { record, site, options, deps, prepare };
}
describe("Ask booking pages for existing authorized native sites", () => {
  it("pins a real stored website baseline and own grant; prepares no grant, reservation or provider write", async () => {
    const h = harness();
    const result = await prepareExistingAskBookingPage(actor, input, h.deps);
    expect(result.changes[0]!.baseline).toEqual(h.site.system.currentRevision);
    expect(result.effects[0]!.channel).toBe("hosted_website");
    expect(result.content.bookingSchedule).toMatchObject({ capabilityId: "consult", version: 3, slots: [{ id: "test-slot-0" }] });
    expect(h.prepare).toHaveBeenCalledWith(actor, workId, expect.objectContaining({ selection: { tenantId: "example", bookingGrantId: grantId, inquiryCapabilityId: "consult-inquiries" } }));
    const repository = createInMemoryPossibilityRepository();
    const port = createPossibilityAdapter(repository, { durable: true, prepare: async () => result });
    const opened = await port.open(actor, input);
    const p = (await repository.get(workspaceId, opened.id))!;
    expect(p.introduces).toEqual([]);
    expect(p.changes[0]!.baseline).toEqual(h.site.system.currentRevision);
    expect(p.status).toBe("exploring");
  });
  it("reads no baseline/catalog/calendar/schedule and prepares nothing with release off", async () => {
    const h = harness();
    await expect(prepareExistingAskBookingPage(actor, input, { ...h.deps, released: async () => false })).rejects.toBeInstanceOf(AskPossibilityUnsupportedError);
    for (const spy of [h.deps.target, h.deps.read, h.deps.options, h.deps.grants, h.deps.calendars, h.deps.schedule, h.prepare]) expect(spy).not.toHaveBeenCalled();
  });
  it.each(["baseline", "pending-draft", "multiple-grants", "foreign-grant", "inquiry", "calendar", "paused", "no-times"])("holds %s as an honest unsupported Request path", async scenario => {
    const h = harness();
    if (scenario === "baseline") h.site.system.currentRevision = null;
    if (scenario === "pending-draft") h.record.rebuild.status = "review_ready";
    if (scenario === "multiple-grants") h.options.tenants[0]!.booking.push({ ...h.options.tenants[0]!.booking[0]!, grantId: scheduleId });
    if (scenario === "foreign-grant") h.deps.grants.mockResolvedValue([{ ...(await h.deps.grants())[0]!, tenant_stable_id: scheduleId }]);
    if (scenario === "inquiry") h.options.tenants[0]!.inquiry = [];
    if (scenario === "calendar") h.deps.calendars.mockResolvedValue([]);
    if (scenario === "paused") h.deps.schedule.mockResolvedValue({ workspaceId, payload: { pause: { reason: "Paused" } } } as never);
    if (scenario === "no-times") h.deps.schedule.mockResolvedValue({ workspaceId, payload: { availability: [], reservations: [] } } as never);
    await expect(prepareExistingAskBookingPage(actor, input, h.deps)).rejects.toBeInstanceOf(AskPossibilityUnsupportedError);
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it("saves an isolated governed native document while preserving published pages and live pointer", async () => {
    const record = native();
    let work: SavedWork = { id: workId, workspaceId, productId: "websites", resourceKind: "website", title: "Example", input: record.rebuild.input, payload: record.rebuild, createdBy: actor.userId, createdAt: time, updatedAt: time };
    const published: WebsiteDocumentRevision = { workspaceId, workId, revision: 1, contentHash: record.rebuild.candidate!.contentHash, document: record.rebuild.candidate!.document, createdBy: actor.userId, createdAt: time, tenantId: "example" };
    const commit = vi.fn(async (_actor, value) => { work = { ...work, payload: value.payload }; return work; });
    const manage = vi.fn(async () => undefined);
    const documents = { manage, published: vi.fn(async () => published), read: vi.fn(async () => published), commitCandidate: commit } as unknown as WebsiteDocumentStore;
    const store = { read: async () => work, member: vi.fn(async () => undefined) } as unknown as BoundedStore;
    const projection = { baseUrl: "https://app.example.test", tenant: "example", inquiry: { capabilityId: "consult-inquiries", version: 2 }, booking: { capabilityId: "consult", version: 3, range: { from: "2026-10-10T12:00:00.000Z", to: "2026-10-10T13:00:00.000Z" } } };
    const service = createWebsiteRebuildService(store, { documents, resolveCapabilities: async () => projection, now: () => time });
    const result = await service.prepareBookingPage(actor, workId, { expectedRevision: 4, candidateRevision: 1, candidateContentHash: published.contentHash, selection: { tenantId: "example", bookingGrantId: grantId, inquiryCapabilityId: "consult-inquiries" }, path: "/book", title: "Book a time", description: "Choose a time with our team" });
    expect(manage).toHaveBeenCalledWith(actor, { workspaceId, workId });
    expect(result.rebuild.status).toBe("review_ready");
    expect(result.rebuild.approvedCandidateRevision).toBeNull();
    expect(result.rebuild.candidate!.document.pages.map(page => page.path)).toEqual(["/", "/book"]);
    expect(result.rebuild.candidate!.document.nodes.copy_0_0).toEqual(published.document.nodes.copy_0_0);
    expect(Object.values(result.rebuild.candidate!.document.nodes).filter(node => node.type === "Booking")).toHaveLength(1);
    expect(Object.values(result.rebuild.candidate!.document.facts).some(fact => fact.highRisk && fact.origin !== "owner_confirmed")).toBe(true);
    expect(published.revision).toBe(1);
    expect(published.document.pages).toHaveLength(1);
    expect(commit).toHaveBeenCalledTimes(1);
    const h = harness();
    h.deps.prepare.mockResolvedValue(result);
    const prepared = await prepareExistingAskBookingPage(actor, input, h.deps);
    const repository = createInMemoryPossibilityRepository();
    const port = createPossibilityAdapter(repository, { durable: true, prepare: async () => prepared });
    const opened = await port.open(actor, input);
    const p = (await repository.get(workspaceId, opened.id))!;
    const reviewed = structuredClone(result);
    const document = reviewed.rebuild.candidate!.document;
    Object.values(document.facts).forEach(fact => { fact.origin = "owner_confirmed"; });
    Object.values(document.nodes).forEach(node => { if (node.verification) node.verification = { supported: true, confidence: 1, needsReview: false }; });
    reviewed.rebuild.candidate!.revision += 1;
    reviewed.rebuild.candidate!.contentHash = siteDocumentHash(document);
    const rows = [{ possibility: p, sourceRef: null, lastActivityAt: p.updatedAt }];
    const repo = { ...repository, createFromSource: vi.fn(), listWithSources: vi.fn() };
    const synced = await syncAskPageSetPossibilities({ stored: rows, repo, actorId: actor.userId, at: time, canWrite: true, read: async () => reviewed, live: { current: async () => ({ revisionId: grantId, number: 3, content: {} }) } });
    const ready = synced[0]!.possibility;
    expect(ready.status).toBe("ready");
    expect(ready.candidateRevision).toBeGreaterThan(p.candidateRevision);
    expect(ready.changes[0]!.candidate.content.document).toEqual(document);
    vi.stubEnv("APPROVE_LINK_SECRET", "booking-preview-test-only");
    try {
      const claims = { workspaceId, possibilityId: ready.id, candidateRevision: ready.candidateRevision };
      const read = async (claim: { candidateRevision: number }) => claim.candidateRevision === ready.candidateRevision ? ready : null;
      const state = await possibilityTryState(signPossibilityPreviewToken(claims), { enabled: async () => true, read });
      expect(state).toMatchObject({ kind: "ready", view: { bookingPath: "/book", bookingSchedule: { capabilityId: "consult", slots: [{ id: "test-slot-0" }] } } });
      expect(await possibilityTryState(signPossibilityPreviewToken({ ...claims, candidateRevision: p.candidateRevision }), { enabled: async () => true, read })).toEqual({ kind: "changed" });
    } finally { vi.unstubAllEnvs(); }
    commit.mockClear();
    await expect(service.prepareBookingPage(actor, workId, { expectedRevision: 4, candidateRevision: 1, candidateContentHash: published.contentHash, selection: { tenantId: "example", bookingGrantId: grantId, inquiryCapabilityId: "consult-inquiries" }, path: "/other", title: "Other", description: "" })).rejects.toThrow("changed");
    expect(commit).not.toHaveBeenCalled();
  });
});
