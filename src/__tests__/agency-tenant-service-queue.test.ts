import { describe, expect, it, vi } from "vitest";
import type { QueueItemRaw, QueueKind, QueueTenant } from "@/platform/operator-queue/contracts";
import type { SourceRead } from "@/platform/operator-queue/project";
import { addAgencyTenantServiceQueue, type TenantServiceDeps } from "@/experience/workspace/agency/tenant-service-queue";
import { agencyClientsPageSchema, type AgencyClientsPage } from "@/experience/workspace/agency-clients";
import { queueKindLabel } from "@/experience/workspace/agency-home";

const agency = "11111111-1111-4111-8111-111111111111";
const harbor = "22222222-2222-4222-8222-222222222222";
const elmwood = "33333333-3333-4333-8333-333333333333";
const stableHarbor = "55555555-5555-4555-8555-555555555555";
const stableElmwood = "66666666-6666-4666-8666-666666666666";
const stableAbsent = "77777777-7777-4777-8777-777777777777";
const actor = { userId: "88888888-8888-4888-8888-888888888888", verifiedEmail: "agency@example.test" };
const now = Date.parse("2026-10-14T12:00:00Z");
const row = (name: string, workspaceId: string, status: "ready" | "unavailable" = "ready") => ({ workspaceId, name, reach: "agency" as const, role: "agency" as const, provider: true, status, systems: [], needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null });
const page = (clients = [row("Harbor Dental", harbor), row("Elmwood Therapy", elmwood)]): AgencyClientsPage => ({ agencyWorkspaceId: agency, clients, queue: [], team: [], total: clients.length, nextCursor: null, providersRead: true });
const raw = (kind: QueueKind, tenantId: string, over: Partial<QueueItemRaw> = {}): QueueItemRaw => ({ kind, sourceRef: `${kind}-${tenantId}`, tenantId, workspaceId: null, title: `${kind} for ${tenantId}`, openedAt: "2026-10-13T12:00:00.000Z", href: `/admin/clients/${tenantId}`, ...over });
const ok = (kind: QueueKind, rows: QueueItemRaw[]): SourceRead => ({ kind, source: kind, ok: true, rows });

function deps(over: Partial<TenantServiceDeps> = {}): TenantServiceDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {};
  const record = <T>(name: string, value: T) => { (calls[name] ??= []).push(value); return value; };
  return {
    calls,
    links: vi.fn(async (ids: string[]) => ids.flatMap(id => id === harbor ? [{ workspaceId: harbor, tenantStableId: stableHarbor }] : id === elmwood ? [{ workspaceId: elmwood, tenantStableId: stableElmwood }] : [])),
    tenants: vi.fn(async () => [{ id: "harbor", siteName: "Harbor", stableId: stableHarbor }, { id: "elmwood", siteName: "Elmwood", stableId: stableElmwood }, { id: "absent", siteName: "Absent", stableId: stableAbsent }]),
    readEventKinds: vi.fn(async (tenants: QueueTenant[]) => { record("tenants", tenants.map(tenant => tenant.id)); return [ok("draft_review", [raw("draft_review", "harbor")]), ok("change_request", [raw("change_request", "harbor", { sourceRef: "cr-1" })]), ok("owner_pending", [])]; }),
    readSiteDrafts: vi.fn(async () => ok("site_draft", [raw("site_draft", "elmwood")])),
    readMaintenanceDigests: vi.fn(async () => ok("maintenance_digest", [raw("maintenance_digest", "absent")])),
    readUnkeptLeads: vi.fn(async () => ok("lead_unkept", [])),
    ...over,
  };
}

describe("agency client site work", () => {
  it("off returns the same page and reads nothing", async () => {
    const d = deps(); const original = page();
    expect(await addAgencyTenantServiceQueue(actor, original, d, false, now)).toBe(original);
    for (const fn of [d.links, d.tenants, d.readEventKinds, d.readSiteDrafts, d.readMaintenanceDigests, d.readUnkeptLeads]) expect(fn).not.toHaveBeenCalled();
  });

  it("lists a served client's drafts, change requests and site drafts, opening the client's own workspace", async () => {
    const result = await addAgencyTenantServiceQueue(actor, page(), deps(), true, now);
    const items = result.queue.filter(item => item.kind === "client_site");
    expect(items.map(item => [item.clientName, item.title]).sort()).toEqual([
      ["Elmwood Therapy", "site_draft for elmwood"], ["Harbor Dental", "change_request for harbor"], ["Harbor Dental", "draft_review for harbor"],
    ]);
    for (const item of items) {
      expect(item.href).toMatch(/^\/workspace\?workspaceId=/);
      expect(JSON.stringify(item)).not.toContain("/admin");
      expect(item.systemId).toBeNull();
    }
    expect(items.find(item => item.title.startsWith("draft_review"))).toMatchObject({ label: "Draft to review", workspaceId: harbor });
    expect(agencyClientsPageSchema.safeParse(result).success).toBe(true);
    expect(queueKindLabel("client_site")).toBe("Client site work");
  });

  it("never reads a client that is not on the page, and ignores rows for tenants it did not ask for", async () => {
    const d = deps();
    const result = await addAgencyTenantServiceQueue(actor, page(), d, true, now);
    expect(d.calls.tenants).toEqual([["harbor", "elmwood"]]);
    expect(result.queue.some(item => item.title.includes("absent"))).toBe(false);
    expect(d.links).toHaveBeenCalledWith([harbor, elmwood]);
  });

  it("skips a client that is not ready or not served by this agency", async () => {
    const d = deps();
    const clients = [row("Harbor Dental", harbor), { ...row("Elmwood Therapy", elmwood), provider: false }];
    const result = await addAgencyTenantServiceQueue(actor, page(clients), d, true, now);
    expect(d.calls.tenants).toEqual([["harbor"]]);
    expect(result.queue.every(item => item.workspaceId === harbor)).toBe(true);
    const unavailable = await addAgencyTenantServiceQueue(actor, page([row("Harbor Dental", harbor, "unavailable")]), deps(), true, now);
    expect(unavailable.queue).toEqual([]);
  });

  it("a failed read names the gap and marks the Queue incomplete", async () => {
    const d = deps({ readSiteDrafts: vi.fn(async () => ({ kind: "site_draft" as const, source: "Site drafts", ok: false as const, reason: "Postgres draft read failed" })) });
    const result = await addAgencyTenantServiceQueue(actor, page(), d, true, now);
    expect(result.queueGaps).toContain("Client site work: could not be read.");
    expect(result.queueComplete).toBe(false);
    expect(result.queue.some(item => item.kind === "client_site")).toBe(true);
    const thrown = await addAgencyTenantServiceQueue(actor, page(), deps({ links: vi.fn(async () => { throw new Error("down"); }) }), true, now);
    expect(thrown.queueGaps).toContain("Client site work: could not be read.");
    expect(thrown.queueComplete).toBe(false);
  });

  it("running twice gives no duplicates", async () => {
    const once = await addAgencyTenantServiceQueue(actor, page(), deps(), true, now);
    const twice = await addAgencyTenantServiceQueue(actor, once, deps(), true, now);
    expect(twice.queue.filter(item => item.kind === "client_site")).toHaveLength(3);
    expect(new Set(twice.queue.map(item => item.id)).size).toBe(twice.queue.length);
  });
});
