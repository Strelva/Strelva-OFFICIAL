import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QUEUE_KINDS, CLIENT_WORK_KINDS, type QueueContext, type QueueItemRaw, type QueueKind } from "@/platform/operator-queue/contracts";
import type { SourceRead } from "@/platform/operator-queue/project";
import { readOperatorQueue, type QueueDependencies } from "@/server/operator-queue/service";

// STRELVA_ONE_QUEUE: client work for a business an agency holds is that
// agency's Queue. Platform health and abuse stay in /admin/queue.

vi.mock("@/app/admin/queue/QueueBoard", () => ({ QueueBoard: () => null }));

const NOW = Date.parse("2026-10-06T12:40:00Z");
const HOUR = 3600_000;
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const AGENCY = "33333333-3333-4333-8333-333333333333";
const STABLE = "66666666-6666-4666-8666-666666666666";
const OPERATOR = "55555555-5555-4555-8555-555555555555";
const actor = { userId: OPERATOR, verifiedEmail: "operator@example.test" };

function raw(kind: QueueKind, overrides: Partial<QueueItemRaw> = {}): QueueItemRaw {
  return { kind, sourceRef: `${kind}-1`, tenantId: "held", workspaceId: null, title: kind, openedAt: new Date(NOW - 3 * HOUR).toISOString(), href: "/admin", ...overrides };
}

function rows(): Partial<Record<QueueKind, QueueItemRaw[]>> {
  return {
    // "held" is linked to a business an agency holds; "free" is linked to none.
    draft_review: [raw("draft_review"), raw("draft_review", { sourceRef: "free-draft", tenantId: "free" })],
    site_draft: [raw("site_draft")],
    lead_unkept: [raw("lead_unkept")],
    change_request: [raw("change_request", { facts: { workflowStatus: "requested" } })],
    service_request: [raw("service_request", { tenantId: null, workspaceId: WORKSPACE }), raw("service_request", { sourceRef: "other", tenantId: null, workspaceId: OTHER_WORKSPACE })],
    ops_alert: [raw("ops_alert", { tenantId: null, facts: { severity: "high" } })],
    site_health: [raw("site_health", { facts: { healthStatus: "blocked" } })],
    domain_unverified: [raw("domain_unverified", { workspaceId: null })],
  };
}

const context: QueueContext = {
  links: [{ tenantId: "held", tenantStableId: STABLE, workspaceId: WORKSPACE, workspaceName: "Held Client", systemId: null }],
  businesses: [{ id: WORKSPACE, name: "Held Client" }, { id: OTHER_WORKSPACE, name: "Free Client" }],
  delegations: [{ agencyWorkspaceId: AGENCY, customerWorkspaceId: WORKSPACE }],
  documentHealth: [], operators: [], marks: [], readbackFailures: [],
};

function deps(): QueueDependencies {
  const byKind = rows();
  return {
    readContext: async () => context,
    readTenants: async () => [{ id: "held", siteName: "Held Site" }, { id: "free", siteName: "Free Site" }],
    readSources: async () => QUEUE_KINDS.map((kind): SourceRead => ({ kind, source: `${kind} source`, ok: true, rows: byKind[kind] ?? [] })),
    emailPaused: () => true,
  };
}

const titles = (queue: Awaited<ReturnType<typeof readOperatorQueue>>) => queue.items.map(item => `${item.kind}:${item.sourceRef}`).sort();

beforeEach(() => { delete process.env.STRELVA_ONE_QUEUE; });
afterEach(() => { delete process.env.STRELVA_ONE_QUEUE; });

describe("delegating client work to the agency that holds the business", () => {
  it("flag off leaves everything where it was", async () => {
    const queue = await readOperatorQueue(actor, deps(), NOW);
    expect(queue.delegated).toBeUndefined();
    expect(titles(queue)).toContain("draft_review:draft_review-1");
    expect(queue.items).toHaveLength(Object.values(rows()).flat().length);
  });

  it("flag on removes a delegated client's service work and counts it under its agency", async () => {
    process.env.STRELVA_ONE_QUEUE = "1";
    const queue = await readOperatorQueue(actor, deps(), NOW);
    const shown = titles(queue);
    for (const gone of ["draft_review:draft_review-1", "site_draft:site_draft-1", "lead_unkept:lead_unkept-1", "change_request:change_request-1", "service_request:service_request-1"]) {
      expect(shown).not.toContain(gone);
    }
    expect(queue.delegated).toEqual([{ agencyWorkspaceId: AGENCY, count: 5 }]);
  });

  it("keeps a business no agency holds, a tenant with no business, platform health and domain_unverified", async () => {
    process.env.STRELVA_ONE_QUEUE = "1";
    const shown = titles(await readOperatorQueue(actor, deps(), NOW));
    expect(shown).toEqual(expect.arrayContaining([
      "draft_review:free-draft", "service_request:other", "ops_alert:ops_alert-1", "site_health:site_health-1", "domain_unverified:domain_unverified-1",
    ]));
  });

  it("keeps the per-source counts in step with what is shown", async () => {
    process.env.STRELVA_ONE_QUEUE = "1";
    const queue = await readOperatorQueue(actor, deps(), NOW);
    for (const count of queue.counts) expect(count.shown + count.closed + count.snoozed).toBe(count.read);
    expect(queue.counts.find(count => count.kind === "draft_review")).toMatchObject({ read: 1, shown: 1 });
  });

  it("treats Strelva Agency as any other delegation row", async () => {
    process.env.STRELVA_ONE_QUEUE = "1";
    const strelvaAgency = "99999999-9999-4999-8999-999999999999";
    const queue = await readOperatorQueue(actor, { ...deps(), readContext: async () => ({ ...context, delegations: [{ agencyWorkspaceId: strelvaAgency, customerWorkspaceId: WORKSPACE }] }) }, NOW);
    expect(queue.delegated).toEqual([{ agencyWorkspaceId: strelvaAgency, count: 5 }]);
  });

  it("names the client-work kinds, and leaves domain_unverified and platform kinds out", () => {
    expect([...CLIENT_WORK_KINDS].sort()).toEqual(["change_request", "draft_review", "lead_unkept", "maintenance_digest", "owner_pending", "service_request", "site_draft"]);
    expect(CLIENT_WORK_KINDS.has("domain_unverified")).toBe(false);
  });

  it("says how many moved above the board", async () => {
    process.env.STRELVA_ONE_QUEUE = "1";
    const { QueueView } = await import("@/app/admin/queue/QueueView");
    const queue = await readOperatorQueue(actor, deps(), NOW);
    const html = renderToStaticMarkup(createElement(QueueView, { queue, me: OPERATOR }));
    expect(html).toContain("5 client items are in their agency&#x27;s Queue. Each agency works them from its own Queue.");
    const flagOff = renderToStaticMarkup(createElement(QueueView, { queue: { ...queue, delegated: undefined }, me: OPERATOR }));
    expect(flagOff).not.toContain("in their agency");
  });
});
