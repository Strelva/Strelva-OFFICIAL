import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readQueueServiceRequestAction, runQueueSourceAction, type QueueSourceAction } from "@/app/admin/queue/source-actions";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), actor: vi.fn(), queue: vi.fn(), request: vi.fn(), execute: vi.fn(),
  lead: vi.fn(), mirror: vi.fn(), clear: vi.fn(), scan: vi.fn(), domains: vi.fn(), refresh: vi.fn(), event: vi.fn(), resolve: vi.fn(), permission: vi.fn(), subscription: vi.fn(), published: vi.fn(), checkHosted: vi.fn(), saveHosted: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.admin, requireTenantPermission: mocks.permission }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/platform/operator-queue/service", () => ({ readOperatorQueue: mocks.queue }));
vi.mock("@/platform/service-requests", () => ({ PostgresServiceRequestStore: {}, ServiceRequestService: class { read = mocks.request; execute = mocks.execute; } }));
vi.mock("@/lib/lead-mirror", () => ({ parsePendingMember: (ref: string) => { const [tenant, leadId] = ref.split(":"); return { tenant, leadId }; }, mirrorLead: mocks.mirror, clearLeadMirrorPending: mocks.clear }));
vi.mock("@/lib/leads", () => ({ getRedisLeadById: mocks.lead, leadSubmissionHash: () => "hash" }));
vi.mock("@/app/api/admin/scan/route", () => ({ POST: mocks.scan }));
vi.mock("@/app/api/admin/domain-monitor/scan/route", () => ({ POST: mocks.domains }));
vi.mock("@/lib/domains", () => ({ refreshDomainClaim: mocks.refresh }));
vi.mock("@/lib/events", () => ({ getEventRaw: mocks.event }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mocks.resolve, operatorActorId: (id: string) => `operator:${id}` }));
// The real operator decision runs (src/lib/operator-decisions.ts): same session, audited.
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => {
  const signedIn = await mocks.actor() as { userId: string; verifiedEmail: string } | null;
  return signedIn ? { id: signedIn.userId, email: signedIn.verifiedEmail, email_confirmed_at: "2026-10-01T00:00:00Z" } : null;
} }));
vi.mock("@/platform/infra/db/repositories", () => ({ getMembershipRole: vi.fn() }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: mocks.subscription }));
vi.mock("@/products/websites/index", () => ({ websiteDocumentStore: { listPublished: mocks.published, recordHealth: mocks.saveHosted }, checkWebsiteHealth: mocks.checkHosted, currentHostedUrl: () => "https://hosted.example.test" }));
vi.mock("@/products/websites/hosted-routing", () => ({ currentHostedUrl: () => "https://hosted.example.test" }));
const actor = { userId: "10000000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" };
const workspaceId = "10000000-0000-4000-8000-000000000002";
const requestId = "10000000-0000-4000-8000-000000000003";
const commandId = "10000000-0000-4000-8000-000000000004";
function item(kind = "lead_unkept", sourceRef = "alpha:lead") { return { key: "queue:item", kind, sourceRef, business: { kind: "workspace", workspaceId, tenantId: "alpha" }, closed: null, closedElsewhere: null }; }
const run = (action: QueueSourceAction, expectedRevision?: number) => runQueueSourceAction({ key: "queue:item", action, commandId, expectedRevision });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1");
  mocks.admin.mockResolvedValue(true); mocks.actor.mockResolvedValue(actor); mocks.queue.mockResolvedValue({ items: [item()] });
  mocks.lead.mockResolvedValue({ id: "lead", name: "Local lead" }); mocks.mirror.mockResolvedValue({ status: "recorded", id: requestId });
  mocks.clear.mockResolvedValue(undefined); mocks.scan.mockResolvedValue(new Response("{}")); mocks.domains.mockResolvedValue(new Response("{}"));
  mocks.refresh.mockResolvedValue({ ok: true }); mocks.permission.mockResolvedValue(null); mocks.subscription.mockResolvedValue(null);
  mocks.event.mockResolvedValue({ type: "change_request", status: "pending", tenantId: "alpha" }); mocks.resolve.mockResolvedValue({ changed: true });
  mocks.request.mockResolvedValue({ id: requestId, businessId: workspaceId, provider: { kind: "strelva" }, status: "requested", providerAcceptance: { status: "pending" }, revision: 3 });
  mocks.execute.mockResolvedValue({});
  mocks.published.mockResolvedValue([{ workspaceId, workId: "website", tenantId: "hosted", revision: 3, contentHash: "a".repeat(64) }]);
  mocks.checkHosted.mockResolvedValue({ status: "healthy", workspaceId, workId: "website", revision: 3 }); mocks.saveHosted.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("queue source actions", () => {
  it.each(["retry_lead", "check_health", "check_domain", "accept_request", "decline_request", "triage", "quote"] as const)("runs nothing while off: %s", async action => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0"); expect((await run(action)).ok).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("rechecks operator authority and rejects stale/mismatched items", async () => {
    mocks.admin.mockResolvedValue(false); expect((await run("retry_lead")).ok).toBe(false); expect(mocks.queue).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue(true); mocks.queue.mockResolvedValue({ items: [] }); expect((await run("retry_lead")).ok).toBe(false);
    mocks.queue.mockResolvedValue({ items: [item()] }); expect((await run("accept_request", 3)).ok).toBe(false); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("copies only the server-derived lead and clears pending only after durable success", async () => {
    expect(await run("retry_lead")).toMatchObject({ ok: true }); expect(mocks.mirror).toHaveBeenCalledWith("alpha", { id: "lead", name: "Local lead" }, "hash", { via: "repair" });
    expect(mocks.clear).toHaveBeenCalledWith("alpha", "lead");
    mocks.clear.mockClear(); mocks.mirror.mockResolvedValue({ status: "failed", reason: "timeout" }); expect((await run("retry_lead")).ok).toBe(false); expect(mocks.clear).not.toHaveBeenCalled();
    mocks.lead.mockResolvedValue(null); expect((await run("retry_lead")).ok).toBe(false); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("rejects a cross-business lead before reading or copying it", async () => {
    mocks.queue.mockResolvedValue({ items: [item("lead_unkept", "other:lead")] }); expect((await run("retry_lead")).ok).toBe(false); expect(mocks.lead).not.toHaveBeenCalled();
  });
  it("reuses the authenticated site scan route and reports failures without closing", async () => {
    mocks.queue.mockResolvedValue({ items: [item("site_health")] }); expect((await run("check_health")).ok).toBe(true);
    expect(await mocks.scan.mock.calls[0]![0].json()).toEqual({ tenant: "alpha" });
    mocks.scan.mockResolvedValue(new Response("{}", { status: 503 })); expect((await run("check_health")).ok).toBe(false);
  });
  it("rechecks an exact workspace publication even without a tenant-workspace link", async () => {
    mocks.queue.mockResolvedValue({ items: [{ ...item("site_health", "document:website:3"), business: { kind: "workspace", workspaceId, tenantId: null } }] });
    expect(await run("check_health")).toMatchObject({ ok: true, message: "Published revision read back and matched." });
    expect(mocks.checkHosted).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, workId: "website", tenantId: "hosted", revision: 3, url: "https://hosted.example.test" }));
    expect(mocks.saveHosted).toHaveBeenCalledOnce(); expect(mocks.scan).not.toHaveBeenCalled();
    mocks.published.mockResolvedValue([{ workspaceId: "other", workId: "website", tenantId: "hosted", revision: 3 }]);
    expect((await run("check_health")).ok).toBe(false); expect(mocks.checkHosted).toHaveBeenCalledOnce();
  });
  it("records a failing hosted readback as attention and refuses to claim a lost health receipt", async () => {
    mocks.queue.mockResolvedValue({ items: [item("site_health", "document:website:3")] });
    mocks.checkHosted.mockResolvedValue({ status: "unreachable" }); expect(await run("check_health")).toMatchObject({ ok: true, message: expect.stringContaining("still needs attention") });
    mocks.saveHosted.mockRejectedValue(new Error("Health storage unavailable")); expect((await run("check_health")).ok).toBe(false);
  });
  it("uses read-only verification or the existing portfolio domain scan", async () => {
    mocks.queue.mockResolvedValue({ items: [item("domain_unverified", "alpha:alpha.test")] }); expect((await run("check_domain")).ok).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledWith("alpha", "alpha.test"); mocks.refresh.mockResolvedValue({ ok: false }); expect((await run("check_domain")).ok).toBe(false);
    mocks.queue.mockResolvedValue({ items: [item("domain_alert")] }); expect((await run("check_domain")).ok).toBe(true); expect(mocks.domains).toHaveBeenCalledOnce();
  });
  it("reads scope before deciding and requires the reviewed revision and same business/provider", async () => {
    mocks.queue.mockResolvedValue({ items: [item("service_request", requestId)] }); expect((await readQueueServiceRequestAction("queue:item")).ok).toBe(true);
    expect((await run("accept_request", 2)).ok).toBe(false); expect(mocks.execute).not.toHaveBeenCalled();
    expect((await run("accept_request", 3)).ok).toBe(true); expect(mocks.execute).toHaveBeenCalledWith(actor, expect.objectContaining({ action: "respond", requestId, expectedRevision: 3, decision: "accepted", idempotencyKey: commandId }));
    expect((await run("decline_request", 3)).ok).toBe(true);
    mocks.request.mockResolvedValue({ businessId: "other", provider: { kind: "strelva" } }); expect((await run("accept_request", 3)).ok).toBe(false);
  });
  it("advances triage/quote through the governed dispatcher with permission and subscription gates", async () => {
    mocks.queue.mockResolvedValue({ items: [item("change_request", "event:change")] }); expect((await run("triage")).ok).toBe(true);
    expect(mocks.resolve).toHaveBeenCalledWith("alpha", "change", "triaged", `operator:${actor.userId}`); expect((await run("quote")).ok).toBe(true);
    expect(mocks.resolve).toHaveBeenLastCalledWith("alpha", "change", "quoted", `operator:${actor.userId}`);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "queue.request.quoted", targetId: "change", metadata: expect.objectContaining({ phase: "attempt", actor: `operator:${actor.userId}` }) }));
    mocks.resolve.mockClear(); mocks.permission.mockResolvedValue(new Response("{}", { status: 403 })); expect((await run("quote")).ok).toBe(false); expect(mocks.resolve).not.toHaveBeenCalled();
    mocks.permission.mockResolvedValue(null); mocks.subscription.mockResolvedValue(new Response("{}", { status: 402 })); expect((await run("quote")).ok).toBe(false); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("preserves source failure as failure", async () => {
    mocks.queue.mockRejectedValue(new Error("storage unavailable")); expect((await run("retry_lead")).ok).toBe(false); expect(mocks.mirror).not.toHaveBeenCalled();
  });
});
