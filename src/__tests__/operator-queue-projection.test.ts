import { describe, expect, it } from "vitest";
import { QUEUE_KINDS, type QueueContext, type QueueItemRaw, type QueueKind, type QueueMark } from "@/platform/operator-queue/contracts";
import { projectQueue, type SourceRead } from "@/platform/operator-queue/project";
import { buildAgencyQueue } from "@/platform/operator-queue/agency-queue";
import { EFFORT_CATEGORY_BY_KIND, prefillMinutes, priorityFor } from "@/platform/operator-queue/rules";
import { UNDO_RULES } from "@/platform/operator-queue/undo";
import { buildDomainView } from "@/platform/operator-queue/domain-view";

const NOW = Date.parse("2026-10-06T12:40:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const AGENCY = "33333333-3333-4333-8333-333333333333";
const SYSTEM = "44444444-4444-4444-8444-444444444444";
const OPERATOR = "55555555-5555-4555-8555-555555555555";
const STABLE = "66666666-6666-4666-8666-666666666666";

function raw(kind: QueueKind, overrides: Partial<QueueItemRaw> = {}): QueueItemRaw {
  return { kind, sourceRef: `${kind}-1`, tenantId: "mclears", workspaceId: null, title: kind, openedAt: iso(NOW - 3 * HOUR), href: "/admin", ...overrides };
}

/** One synthetic row per kind, shaped like each reader's output. */
function fixtureRows(): Record<QueueKind, QueueItemRaw[]> {
  return {
    draft_review: [raw("draft_review", { tenantId: "mooney", facts: { expiresAt: iso(NOW + 80 * DAY) } }), raw("draft_review", { sourceRef: "draft-2", tenantId: "mooney" })],
    site_draft: [raw("site_draft", { tenantId: "twin-trees" })],
    maintenance_digest: [raw("maintenance_digest", { tenantId: "twin-trees" })],
    change_request: [raw("change_request", { tenantId: "gldf", dueAt: iso(NOW - HOUR), facts: { workflowStatus: "requested" } })],
    owner_pending: [raw("owner_pending", { tenantId: "rohlax" })],
    ops_alert: [raw("ops_alert", { facts: { severity: "high" } })],
    domain_alert: [raw("domain_alert", { tenantId: "rohlax", facts: { domainState: "expiring", daysToExpiry: 21 } })],
    domain_unverified: [raw("domain_unverified", { openedAt: iso(NOW - 9 * DAY) })],
    site_health: [raw("site_health", { facts: { healthStatus: "unknown" } })],
    service_request: [raw("service_request", { tenantId: null, workspaceId: OTHER_WORKSPACE })],
    operational_exception: [raw("operational_exception", { tenantId: null, workspaceId: WORKSPACE })],
    assignment_offer: [raw("assignment_offer", { tenantId: null, workspaceId: WORKSPACE })],
    lead_unkept: [raw("lead_unkept", { openedAt: iso(NOW - 3 * HOUR) })],
    prospect_lead: [raw("prospect_lead", { tenantId: null })],
    readback_failed: [raw("readback_failed", { tenantId: "mooney", receiptIds: ["77777777-7777-4777-8777-777777777777"] })],
  };
}

function reads(rows = fixtureRows(), down: QueueKind[] = []): SourceRead[] {
  return QUEUE_KINDS.map((kind) => down.includes(kind)
    ? { kind, source: `${kind} source`, ok: false as const, reason: "Redis unavailable" }
    : { kind, source: `${kind} source`, ok: true as const, rows: rows[kind] });
}

function mark(kind: QueueKind, sourceRef: string, overrides: Partial<QueueMark> = {}): QueueMark {
  return {
    source: kind, sourceRef, assigneeUserId: null, assigneeEmail: null, pinnedUntil: null, snoozedUntil: null, snoozeReason: null,
    closedState: null, closedReason: null, closedReceiptId: null, closedAt: null, ownerToldVia: null, ownerToldAt: null,
    revision: 2, updatedBy: OPERATOR, updatedAt: iso(NOW - HOUR), notes: [], ...overrides,
  };
}

function context(marks: QueueMark[] = []): QueueContext {
  return {
    links: [{ tenantId: "mclears", tenantStableId: STABLE, workspaceId: WORKSPACE, workspaceName: "McClear's", systemId: SYSTEM }],
    businesses: [{ id: WORKSPACE, name: "McClear's" }, { id: OTHER_WORKSPACE, name: "Leslie" }],
    delegations: [{ agencyWorkspaceId: AGENCY, customerWorkspaceId: WORKSPACE }],
    documentHealth: [],
    operators: [{ userId: OPERATOR, email: "jacob@example.test" }],
    marks,
    readbackFailures: [],
  };
}

const tenants = [
  { id: "mclears", siteName: "McClear's" }, { id: "gldf", siteName: "gldf" }, { id: "mooney", siteName: "The Mooney Firm", stableId: "88888888-8888-4888-8888-888888888888" },
  { id: "rohlax", siteName: "Rohlax" }, { id: "twin-trees", siteName: "Twin Trees" },
];

describe("operator queue projection", () => {
  it("count parity: every row from all fifteen kinds lands in the list or parked", () => {
    const rows = fixtureRows();
    const queue = projectQueue({ reads: reads(rows), context: context(), tenants, emailPaused: false, now: NOW });
    const sourceTotal = Object.values(rows).reduce((sum, list) => sum + list.length, 0);
    expect(queue.complete).toBe(true);
    expect(queue.items.length + queue.parked.length).toBe(sourceTotal);
    for (const count of queue.counts) {
      expect(count.read).toBe(rows[count.kind].length);
      expect(count.shown + count.closed + count.snoozed).toBe(count.read);
    }
    expect(new Set(queue.items.map((item) => item.kind))).toEqual(new Set(QUEUE_KINDS));
  });

  it("one source down marks the list incomplete and names it, never a shorter silent list", () => {
    const queue = projectQueue({ reads: reads(fixtureRows(), ["change_request"]), context: context(), tenants, emailPaused: false, now: NOW });
    expect(queue.complete).toBe(false);
    expect(queue.gaps).toEqual([{ kind: "change_request", source: "change_request source", reason: "Redis unavailable" }]);
    expect(queue.items.some((item) => item.kind === "change_request")).toBe(false);
  });

  it("a missing source is an explicit gap even if every attempted read succeeded", () => {
    const queue = projectQueue({ reads: reads().filter((read) => read.kind !== "assignment_offer"), context: context(), tenants, emailPaused: false, now: NOW });
    expect(queue.complete).toBe(false);
    expect(queue.gaps).toEqual([{ kind: "assignment_offer", source: "assignment offer", reason: "Source was not read" }]);
  });

  it("without Postgres the marks are unknown, so the list is incomplete", () => {
    const queue = projectQueue({ reads: reads(), context: null, contextFailure: "Queue storage is unavailable.", tenants, emailPaused: false, now: NOW });
    expect(queue.complete).toBe(false);
    expect(queue.gaps[0]?.source).toBe("Queue marks and receipts");
  });

  it("orders pinned first, then P1→P4, oldest due first within a level", () => {
    const queue = projectQueue({ reads: reads(), context: context([mark("prospect_lead", "prospect_lead-1", { pinnedUntil: iso(NOW + 20 * HOUR) })]), tenants, emailPaused: false, now: NOW });
    expect(queue.items[0]!.kind).toBe("prospect_lead");
    expect(queue.items[0]!.pinned).toBe(true);
    const ranks = queue.items.slice(1).map((item) => item.priority);
    expect([...ranks].sort()).toEqual(ranks);
    const p2 = queue.items.filter((item) => item.priority === "P2" && !item.pinned);
    expect(p2[0]!.kind).toBe("change_request"); // the only P2 with a due time, and it is late
    expect(p2[0]!.late).toBe(true);
  });

  it("resolves tenant → workspace through the conversion link, and names unconverted tenants", () => {
    const queue = projectQueue({ reads: reads(), context: context(), tenants, emailPaused: false, now: NOW });
    const lead = queue.items.find((item) => item.kind === "lead_unkept")!;
    expect(lead.business).toEqual({ kind: "workspace", workspaceId: WORKSPACE, name: "McClear's", tenantId: "mclears" });
    expect(lead.system).toEqual({ id: SYSTEM, label: "McClear's website" });
    const draft = queue.items.find((item) => item.kind === "site_draft")!;
    expect(draft.business).toEqual({ kind: "tenant", tenantId: "twin-trees", name: "Twin Trees" });
    const reply = queue.items.find((item) => item.kind === "readback_failed")!;
    expect(reply.system?.id).toBe("88888888-8888-4888-8888-888888888888");
    expect(queue.items.find((item) => item.kind === "prospect_lead")!.business).toEqual({ kind: "strelva" });
  });

  it("says the owner was not told when client email is paused", () => {
    const paused = projectQueue({ reads: reads(), context: context(), tenants, emailPaused: true, now: NOW });
    expect(paused.items.find((item) => item.kind === "owner_pending")!.ownerReach).toEqual({ status: "email_paused" });
    const live = projectQueue({ reads: reads(), context: context([mark("owner_pending", "owner_pending-1", { ownerToldVia: "email", ownerToldAt: iso(NOW - DAY) })]), tenants, emailPaused: true, now: NOW });
    const told = live.items.find((item) => item.kind === "owner_pending")!;
    expect(told.ownerReach).toEqual({ status: "told", via: "email", at: iso(NOW - DAY) });
    expect(told.state).toBe("waiting_on_owner");
    expect(told.dueAt).toBe(iso(NOW - DAY + 4 * DAY));
  });

  it("parks closed and snoozed items, never a P1 snooze", () => {
    const marks = [
      mark("site_draft", "site_draft-1", { closedState: "done", closedReason: "Published", closedAt: iso(NOW - HOUR) }),
      mark("maintenance_digest", "maintenance_digest-1", { snoozedUntil: iso(NOW + DAY), snoozeReason: "Owner on vacation" }),
      mark("lead_unkept", "lead_unkept-1", { snoozedUntil: iso(NOW + DAY), snoozeReason: "stale mark" }),
    ];
    const queue = projectQueue({ reads: reads(), context: context(marks), tenants, emailPaused: false, now: NOW });
    expect(queue.parked.map((item) => item.kind).sort()).toEqual(["maintenance_digest", "site_draft"]);
    expect(queue.items.find((item) => item.kind === "lead_unkept")!.snoozed).toBeNull();
    const counts = Object.fromEntries(queue.counts.map((count) => [count.kind, count]));
    expect(counts.site_draft).toMatchObject({ read: 1, closed: 1, shown: 0 });
    expect(counts.maintenance_digest).toMatchObject({ read: 1, snoozed: 1, shown: 0 });
  });

  it("shows an item closed by its source as closed elsewhere", () => {
    const rows = fixtureRows();
    rows.draft_review = [raw("draft_review", { tenantId: "mooney", facts: { closedElsewhere: { by: "the owner", at: iso(NOW - HOUR) } } })];
    const queue = projectQueue({ reads: reads(rows), context: context(), tenants, emailPaused: false, now: NOW });
    const parked = queue.parked.find((item) => item.kind === "draft_review")!;
    expect(parked.state).toBe("done");
    expect(parked.closedElsewhere).toEqual({ by: "the owner", at: iso(NOW - HOUR) });
  });

  it("a duplicate ref from one source counts once", () => {
    const rows = fixtureRows();
    rows.prospect_lead = [raw("prospect_lead"), raw("prospect_lead")];
    const queue = projectQueue({ reads: reads(rows), context: context(), tenants, emailPaused: false, now: NOW });
    expect(queue.counts.find((count) => count.kind === "prospect_lead")!.read).toBe(1);
  });
});

describe("priority and clocks", () => {
  it("does not describe an uncertain provider dispatch as accepted", () => {
    expect(priorityFor(raw("readback_failed", { facts: { writeAcceptance: "unknown" } }), NOW)).toMatchObject({ priority: "P1", reason: "The provider's acceptance is uncertain. Never re-sent automatically." });
  });
  it("raises a draft older than 80 days to P2 with days left", () => {
    const opened = NOW - 85 * DAY;
    const result = priorityFor(raw("draft_review", { openedAt: iso(opened), facts: { expiresAt: iso(opened + 90 * DAY) } }), NOW);
    expect(result).toEqual({ priority: "P2", move: "strelva", reason: "Expires in 5 days." });
  });

  it("domain harm: down is P1, expiring in 7 days is P1 owner, 21 days is the owner's call", () => {
    expect(priorityFor(raw("domain_alert", { facts: { domainState: "down" } }), NOW).priority).toBe("P1");
    expect(priorityFor(raw("domain_alert", { facts: { domainState: "expiring", daysToExpiry: 7 } }), NOW)).toMatchObject({ priority: "P1", move: "owner" });
    expect(priorityFor(raw("domain_alert", { facts: { domainState: "expiring", daysToExpiry: 21 } }), NOW)).toMatchObject({ priority: "P4", move: "owner" });
  });

  it("a quoted change request waits on the owner", () => {
    expect(priorityFor(raw("change_request", { facts: { workflowStatus: "quoted" } }), NOW)).toMatchObject({ priority: "P4", move: "owner" });
  });

  it("P1 is late two hours after opening unless someone has taken it", () => {
    const queue = projectQueue({ reads: reads(), context: context(), tenants, emailPaused: false, now: NOW });
    const lead = queue.items.find((item) => item.kind === "lead_unkept")!;
    expect(lead.dueAt).toBe(iso(NOW - HOUR));
    expect(lead.late).toBe(true);
    const taken = projectQueue({ reads: reads(), context: context([mark("lead_unkept", "lead_unkept-1", { assigneeUserId: OPERATOR, assigneeEmail: "jacob@example.test" })]), tenants, emailPaused: false, now: NOW });
    const takenLead = taken.items.find((item) => item.kind === "lead_unkept")!;
    expect(takenLead.late).toBe(false);
    expect(takenLead.state).toBe("taken");
  });

  it("maps every kind to a minutes category and prefills from focused time", () => {
    expect(Object.keys(EFFORT_CATEGORY_BY_KIND).sort()).toEqual([...QUEUE_KINDS].sort());
    expect(EFFORT_CATEGORY_BY_KIND.change_request).toBe("change");
    expect(EFFORT_CATEGORY_BY_KIND.draft_review).toBe("review");
    expect(EFFORT_CATEGORY_BY_KIND.domain_alert).toBe("recovery");
    expect(EFFORT_CATEGORY_BY_KIND.prospect_lead).toBe("sales");
    expect(prefillMinutes(5 * 60_000 + 1)).toBe(6);
    expect(prefillMinutes(0)).toBe(1);
    expect(prefillMinutes(24 * HOUR)).toBe(480);
  });
});

describe("undo labels", () => {
  it("never offers a Vercel removal and says plainly what can't be undone", () => {
    expect(UNDO_RULES.domain_add.undo).toBe("claim_only");
    expect(UNDO_RULES.domain_add.label).toMatch(/never removes a Vercel domain/);
    expect(UNDO_RULES.domain_claim_removal.undo).toBe("not_available");
    expect(UNDO_RULES.review_reply.label).toBe("Google review replies can't be undone from Strelva. You can edit or delete the reply in Google.");
    expect(UNDO_RULES.gbp_hours.undo).toBe("put_back_draft");
    expect(UNDO_RULES.content_publish.undo).toBe("available");
  });
});

describe("agency queue view model", () => {
  it("shows only delegated businesses and never Strelva-only kinds", () => {
    const queue = projectQueue({ reads: reads(), context: context(), tenants, emailPaused: false, now: NOW });
    const view = buildAgencyQueue(queue, context().delegations, AGENCY);
    expect(view.groups.map((group) => group.workspaceId)).toEqual([WORKSPACE]);
    const kinds = view.groups.flatMap((group) => group.items.map((item) => item.kind));
    expect(kinds).not.toContain("lead_unkept");
    expect(kinds).not.toContain("prospect_lead");
    expect(kinds).toEqual(expect.arrayContaining(["operational_exception", "assignment_offer"]));
    expect(buildAgencyQueue(queue, context().delegations, OTHER_WORKSPACE).total).toBe(0);
  });
});

describe("one domain view", () => {
  it("joins claims, registration state and the monitor; unclaimed monitored hosts still show", () => {
    const rows = buildDomainView([{
      systemLabel: "McClear's website",
      claims: [{ domain: "mclears.example", tenantId: "mclears", role: "production", status: "pending", dnsStatus: "misconfigured", sslStatus: "pending", createdAt: iso(NOW - 9 * DAY), updatedAt: iso(NOW - 2 * DAY), registrationAttempt: "confirmed" }],
      monitor: {
        tenantId: "mclears", siteName: "McClear's", ownerName: "", primaryHost: "mclears.example", worst: "up", nearestExpiryDays: 21,
        checks: [
          { host: "mclears.example", kind: "custom", url: "https://mclears.example", httpStatus: 200, bytes: 9000, state: "up", expiresAt: "2026-10-27", daysToExpiry: 21, checkedAt: iso(NOW - HOUR), latencyMs: 120 },
          { host: "mclears.strelva.com", kind: "platform", url: "https://mclears.strelva.com", httpStatus: 200, bytes: 9000, state: "up", expiresAt: null, daysToExpiry: null, checkedAt: iso(NOW - HOUR), latencyMs: 80 },
        ],
      },
    }]);
    expect(rows).toHaveLength(2);
    const custom = rows.find((row) => row.domain === "mclears.example")!;
    expect(custom).toMatchObject({ system: "McClear's website", registration: "confirmed", uptime: { state: "up", label: "Up" }, expiry: { days: 21, label: "Expires in 21 days" }, lastCheckedAt: iso(NOW - HOUR) });
    expect(custom.verification.label).toBe("Waiting on DNS");
    expect(custom.whoCanChange).toMatch(/never removes the domain from Vercel/);
    expect(rows.find((row) => row.domain === "mclears.strelva.com")!.verification.label).toBe("Strelva address");
  });
});
