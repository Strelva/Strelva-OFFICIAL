import { QUEUE_KINDS, type OperatorQueue, type QueueContext, type QueueItemRaw, type QueueKind, type QueueMark } from "@/platform/operator-queue/contracts";
import { projectQueue, type SourceRead } from "@/platform/operator-queue/project";

/**
 * Local visual fixture for the operator queue. Fictional businesses only; it
 * runs the real projection so ordering, clocks and labels are the real rules.
 */
export type QueuePreviewScenario = "full" | "incomplete" | "empty";

export function queuePreviewScenario(value: string | undefined): QueuePreviewScenario {
  return value === "incomplete" || value === "empty" ? value : "full";
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ME = "00000000-0000-4000-8000-0000000000aa";
const PIP = "00000000-0000-4000-8000-0000000000bb";
const HARBOR = "00000000-0000-4000-8000-0000000000c1";
const ALDER = "00000000-0000-4000-8000-0000000000c2";

export const PREVIEW_OPERATOR = ME;

function rows(now: number): Record<QueueKind, QueueItemRaw[]> {
  const at = (ms: number) => new Date(now - ms).toISOString();
  const r = (kind: QueueKind, ref: string, tenantId: string | null, title: string, openedAgo: number, extra: Partial<QueueItemRaw> = {}): QueueItemRaw =>
    ({ kind, sourceRef: ref, tenantId, workspaceId: null, title, openedAt: at(openedAgo), href: "/admin", ...extra });
  return {
    lead_unkept: [r("lead_unkept", "harbor-bakery:lead-1", "harbor-bakery", "A lead's Postgres copy failed. It is safe in Redis for 90 days.", 3 * HOUR)],
    change_request: [
      r("change_request", "event:cr-1", "alder-tile", "New wholesale page (requested)", 20 * HOUR, { dueAt: new Date(now + 3 * HOUR).toISOString(), facts: { workflowStatus: "requested" } }),
      r("change_request", "event:cr-2", "alder-tile", "Swap the hero photo (quoted)", 2 * DAY, { facts: { workflowStatus: "quoted" } }),
    ],
    draft_review: [
      r("draft_review", "event:rr-1", "kestrel-law", "Reply to a 5-star review from Dana", 6 * HOUR, { facts: { expiresAt: new Date(now + 84 * DAY).toISOString() } }),
      r("draft_review", "event:rr-2", "kestrel-law", "Reply to a 4-star review from Sam", 83 * DAY, { facts: { expiresAt: new Date(now + 7 * DAY).toISOString() } }),
    ],
    owner_pending: [r("owner_pending", "event:own-1", "willow-pilates", "Publish the spring schedule", 2 * DAY)],
    domain_alert: [r("domain_alert", "expiring:willowpilates.example", "willow-pilates", "willowpilates.example expires on 2026-10-27", 6 * HOUR, { facts: { domainState: "expiring", daysToExpiry: 21 } })],
    site_health: [r("site_health", "site:kestrel-law", "kestrel-law", "Kestrel Law: no recent evidence", 2 * DAY, { facts: { healthStatus: "unknown" } })],
    maintenance_digest: [r("maintenance_digest", "willow-pilates:2026-10-05", "willow-pilates", "Maintenance digest for the week of 2026-10-05 (3 items)", DAY)],
    site_draft: [r("site_draft", "harbor-bakery:services", "harbor-bakery", "Draft of the services section", 0)],
    service_request: [r("service_request", "sr-1", null, "Add online ordering for pickup", 5 * HOUR, { workspaceId: ALDER })],
    operational_exception: [],
    assignment_offer: [],
    ops_alert: [],
    domain_unverified: [r("domain_unverified", "alder-tile:aldertile.example", "alder-tile", "aldertile.example is pending and waiting on the owner's DNS", 9 * DAY)],
    prospect_lead: [r("prospect_lead", "token-1", null, "New request from Maple Street Dental", 4 * HOUR)],
    readback_failed: [r("readback_failed", "r-1", "kestrel-law", "Reply to a Google review: accepted, read-back failed", 50 * 60_000)],
  };
}

function context(now: number): QueueContext {
  const mark = (source: QueueKind, sourceRef: string, overrides: Partial<QueueMark>): QueueMark => ({
    source, sourceRef, assigneeUserId: null, assigneeEmail: null, pinnedUntil: null, snoozedUntil: null, snoozeReason: null,
    closedState: null, closedReason: null, closedReceiptId: null, closedAt: null, ownerToldVia: null, ownerToldAt: null,
    revision: 2, updatedBy: ME, updatedAt: new Date(now - HOUR).toISOString(), notes: [], ...overrides,
  });
  return {
    links: [
      { tenantId: "harbor-bakery", tenantStableId: "00000000-0000-4000-8000-0000000000d1", workspaceId: HARBOR, workspaceName: "Harbor Bakery", systemId: "00000000-0000-4000-8000-0000000000e1" },
      { tenantId: "alder-tile", tenantStableId: "00000000-0000-4000-8000-0000000000d2", workspaceId: ALDER, workspaceName: "Alder Tile", systemId: "00000000-0000-4000-8000-0000000000e2" },
    ],
    businesses: [{ id: HARBOR, name: "Harbor Bakery" }, { id: ALDER, name: "Alder Tile" }],
    delegations: [],
    documentHealth: [],
    operators: [{ userId: ME, email: "jacob@strelva.example" }, { userId: PIP, email: "noah@strelva.example" }],
    marks: [
      mark("change_request", "event:cr-1", { assigneeUserId: ME, assigneeEmail: "jacob@strelva.example", notes: [{ id: "00000000-0000-4000-8000-0000000000f1", body: "Quote at 2 hours once the copy is in.", by: "jacob@strelva.example", at: new Date(now - 2 * HOUR).toISOString() }] }),
      mark("prospect_lead", "token-1", { pinnedUntil: new Date(now + 20 * HOUR).toISOString() }),
      mark("site_draft", "harbor-bakery:services", { snoozedUntil: new Date(now + 2 * DAY).toISOString(), snoozeReason: "Owner is sending new prices" }),
      mark("maintenance_digest", "willow-pilates:2026-09-28", { closedState: "done", closedReason: "Approved", closedAt: new Date(now - DAY).toISOString() }),
    ],
    readbackFailures: [],
  };
}

const tenants = [
  { id: "harbor-bakery", siteName: "Harbor Bakery" }, { id: "alder-tile", siteName: "Alder Tile" },
  { id: "kestrel-law", siteName: "Kestrel Law", stableId: "00000000-0000-4000-8000-0000000000d3" }, { id: "willow-pilates", siteName: "Willow Pilates" },
];

export function queuePreview(scenario: QueuePreviewScenario, now = Date.now()): OperatorQueue {
  const data = rows(now);
  if (scenario === "empty") for (const kind of QUEUE_KINDS) data[kind] = [];
  data.maintenance_digest.push(...(scenario === "empty" ? [] : [{
    kind: "maintenance_digest" as const, sourceRef: "willow-pilates:2026-09-28", tenantId: "willow-pilates", workspaceId: null,
    title: "Maintenance digest for the week of 2026-09-28", openedAt: new Date(now - 8 * DAY).toISOString(), href: "/admin/digests",
  }]));
  const down: QueueKind[] = scenario === "incomplete" ? ["change_request", "domain_alert"] : [];
  const reads: SourceRead[] = QUEUE_KINDS.map((kind) => down.includes(kind)
    ? { kind, source: kind === "change_request" ? "Change requests" : "Domain monitor", ok: false as const, reason: kind === "change_request" ? "Redis unavailable" : "No domain scan on record" }
    : { kind, source: kind, ok: true as const, rows: data[kind] });
  return projectQueue({ reads, context: context(now), tenants, emailPaused: true, now });
}
