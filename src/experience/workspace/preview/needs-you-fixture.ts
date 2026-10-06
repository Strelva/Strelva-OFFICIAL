/**
 * Local fixture for Needs you and Strelva handled on Home. Fictional asks for
 * The Mooney Firm (spec section 1). Nothing leaves the browser; decisions
 * only change this in-memory list.
 */
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import { handledFromStore } from "@/platform/needs-you/handled";
import { buildPolicyView, ownerChangeSchema, planOwnerChange, REFUSAL_WORDS, type PlannedWrite, type PolicyRows } from "@/platform/needs-you/policy-model";

/** The Mooney Firm has made Google posts its own call; Strelva lets routine edits through after notice. */
const POLICY_ROWS: PolicyRows = {
  settings: [
    { layer: "owner", kind: "google.post", systemId: null, route: "owner_decides", version: 1, reason: "owner_setting", updatedAt: "2026-10-05T15:00:00Z" },
    { layer: "strelva", kind: "copy.routine", systemId: null, route: "handle_after_notice", version: 1, reason: "strelva_default", updatedAt: "2026-10-01T15:00:00Z" },
  ],
  history: [
    { id: "e0000000-0000-4000-8000-000000000001", systemId: null, kind: "google.post", layer: "owner", oldRoute: null, newRoute: "owner_decides", reason: "owner_setting", version: 1, at: "2026-10-05T15:00:00Z" },
    { id: "e0000000-0000-4000-8000-000000000002", systemId: null, kind: "copy.routine", layer: "strelva", oldRoute: null, newRoute: "handle_after_notice", reason: "strelva_default", version: 1, at: "2026-10-01T15:00:00Z" },
  ],
};

let previewHistory = 10;
/** What set_decision_policy does, in memory, for the preview only. */
function applyPreviewPolicy(rows: PolicyRows, write: Extract<PlannedWrite, { ok: true }>["write"]): PolicyRows {
  const current = rows.settings.find(row => row.layer === write.layer && row.kind === write.kind && row.systemId === write.systemId) ?? null;
  const version = (current?.version ?? 0) + 1;
  const others = rows.settings.filter(row => row !== current);
  const settings = write.route ? [...others, { layer: write.layer, kind: write.kind, systemId: write.systemId, route: write.route, version, reason: "owner_setting", updatedAt: new Date().toISOString() }] : others;
  const id = `e0000000-0000-4000-8000-${String(++previewHistory).padStart(12, "0")}`;
  return { settings, history: [{ id, systemId: write.systemId, kind: write.kind, layer: write.layer, oldRoute: current?.route ?? null, newRoute: write.route, reason: write.route ? "owner_setting" : "owner_reset", version, at: new Date().toISOString() }, ...rows.history] };
}

const MOONEY = "a0000000-0000-4000-8000-000000000001";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function item(n: number, over: Partial<OwnerDecision>): OwnerDecision {
  const at = new Date(Date.parse("2026-10-06T11:00:00Z") - n * 3_600_000).toISOString();
  return {
    id: `d0000000-0000-4000-8000-00000000000${n}`, workspaceId: MOONEY, systemId: null, kind: "customer.commitment", route: "owner_decides",
    title: "", detail: null, approveEffect: "Strelva makes this change.", notYetEffect: "Nothing changes.", sourceLifecycle: "tenant_event",
    sourceId: `mooney-firm:evt-${n}`, revisionHash: String(n).repeat(64).slice(0, 64), urgent: false, signInRequired: false, adminMayDecide: true,
    openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
    deliveryState: "suppressed", operatorNote: null, openedAt: at, expiresAt: new Date(Date.parse(at) + 14 * 86_400_000).toISOString(),
    reminded1At: null, reminded2At: null, deliveries: [], ...over,
  };
}

function initialItems(): OwnerDecision[] {
  return [
    item(3, {
      kind: "customer.commitment", urgent: true,
      title: "Reply to Jordan's mediation inquiry, quoting the consult fee",
      detail: "\"Thanks for reaching out. An initial consultation is $150 and takes about an hour. I have openings Thursday afternoon.\"",
      approveEffect: "The reply sends to Jordan.", notYetEffect: "Nothing sends.",
    }),
    item(2, {
      kind: "system.go_live", sourceLifecycle: "website_document", title: "Put the consult booking page live on attymooney.com",
      approveEffect: "The booking page goes live.", notYetEffect: "Nothing goes live.", openHref: "/workspace?view=apps",
    }),
    item(1, {
      kind: "google.post", title: "Post this week's mediation tip on Google", operatorNote: "It mentions a price, so Sheri should see it first.",
      approveEffect: "The post goes up on your Google listing.", notYetEffect: "Nothing is posted.",
    }),
  ];
}

const HANDLED: HandledReceipt[] = [
  // A decided Needs you item, through the real mapper (20261009130000).
  ...[handledFromStore({
    store: "owner_decisions", id: "5f1c2a00-0000-4000-8000-000000000001", at: "2026-10-06T16:20:00Z", kind: "customer.commitment",
    title: "Booking request: Dana Reed, Tue, Oct 13 3:00 PM", state: "approved", outcome: "done", sourceLifecycle: "booking_request",
    decidedByKind: "owner_link", approveEffect: "The booking is confirmed for this time.", systemId: null,
  })].flatMap(receipt => receipt ?? []),
  { id: "record:14", store: "business_record_revisions", systemId: null, sentence: "Strelva updated your hours in your business record", at: "2026-10-06T14:10:00Z", changed: "hours", evidence: null, undo: { state: "undo" } },
  { id: "tenant_event:evt-9", store: "tenant_events", systemId: null, sentence: "Strelva replied to Dana's review on Google", at: "2026-10-05T21:02:00Z", changed: null, evidence: { providerAccepted: true, readBack: "verified" }, undo: { state: "not_undoable", reason: "Google has the reply; delete it on Google." } },
  { id: "tenant_event:evt-7", store: "tenant_events", systemId: null, sentence: "Strelva updated your website: Friday hours", at: "2026-10-05T14:12:00Z", changed: "hours", evidence: null, undo: { state: "undo_needs_review", reason: "Undo drafts a revert that Strelva reviews before it goes live." } },
];

/** Answers /api/workspace/needs-you for the Mooney scenarios and adds the release to snapshots. */
/** Fictional numbers for the fictional firm's site. */
const SITE_SUMMARY = {
  tenantId: "mooney", siteName: "attymooney.com",
  visits: { total: 2140, thisWeek: 96 }, actions: { total: 61, thisWeek: 4 },
  leads: { count: 3, recent: [
    { id: "lead-1", name: "Priya S.", message: "Do you handle small business leases? I have a renewal in November.", createdAt: "2026-10-05T14:10:00Z" },
    { id: "lead-2", name: "Tom R.", message: "Looking for a consult about a contractor dispute.", createdAt: "2026-10-03T09:30:00Z" },
  ] },
  activity: [
    { id: "act-1", label: "Updated your hours on Google", detail: null, time: "2026-10-04T15:00:00Z" },
    { id: "act-2", label: "Replied to a review", detail: "Dana, 5 stars", time: "2026-10-02T21:00:00Z" },
  ],
};

export function withNeedsYouPreview(base: typeof fetch, scenario: string, enabled: boolean): typeof fetch {
  let items = scenario === "mooney-empty" ? [] : initialItems();
  let handled = scenario === "mooney-empty" ? [] : [...HANDLED];
  let policyRows: PolicyRows = scenario === "mooney-empty" ? { settings: [], history: [] } : structuredClone(POLICY_ROWS);
  const role = scenario === "mooney-member" ? "member" : "owner";
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    const method = init?.method || "GET";
    if (url.pathname === "/api/workspace/needs-you" && method === "GET") {
      if (!enabled) return json({ error: "Needs you is not enabled." }, 503);
      if (scenario === "mooney-loading") await new Promise(resolve => setTimeout(resolve, 20_000));
      if (scenario === "mooney-error") return json({ error: "Unavailable." }, 503);
      const id = url.searchParams.get("workspaceId");
      if (id !== MOONEY) return json({ role, items: [], complete: true, handled: [], handledAvailable: true });
      return json({ role, items, complete: true, handled, handledAvailable: true });
    }
    if (url.pathname === "/api/workspace/needs-you" && method === "POST") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { itemId?: string; decision?: string };
      if (role !== "owner") return json({ status: "forbidden", item: null }, 403);
      const found = items.find(entry => entry.id === body.itemId);
      if (!found) return json({ status: "already_handled", item: null }, 409);
      items = items.filter(entry => entry.id !== found.id);
      return json({ status: "done", item: { ...found, state: body.decision === "approve" ? "approved" : "declined", outcome: "done" } });
    }
    if (url.pathname === "/api/workspace/needs-you/undo" && method === "POST") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { receiptId?: string };
      handled = handled.map(receipt => receipt.id === body.receiptId ? { ...receipt, undo: { state: "undone" } } : receipt);
      return json({ result: { revision: 15 } });
    }
    // Home's "From your site" (owner entry): shown with Needs you, for The Mooney Firm only.
    if (url.pathname === "/api/workspace/site-summary" && method === "GET") {
      if (!enabled || url.searchParams.get("workspaceId") !== MOONEY) return json({ error: "Not open for this business yet." }, 503);
      if (scenario === "mooney-loading") await new Promise(resolve => setTimeout(resolve, 20_000));
      if (scenario === "mooney-error") return json({ error: "Unavailable." }, 500);
      return json(scenario === "mooney-empty" ? { sites: [{ ...SITE_SUMMARY, leads: { count: 0, recent: [] }, activity: [] }], deniedSites: [] } : { sites: [SITE_SUMMARY], deniedSites: [] });
    }
    if (url.pathname === "/api/workspace/needs-you/policy") {
      if (!enabled) return json({ error: "Needs you is not enabled." }, 503);
      if (scenario === "mooney-loading") await new Promise(resolve => setTimeout(resolve, 20_000));
      if (scenario === "mooney-error") return json({ error: "Who decides could not be loaded. Nothing about it changed." }, 503);
      if (method === "GET") return json({ role, view: buildPolicyView(policyRows) });
      if (role !== "owner") return json({ error: "Only the owner can change who decides. Nothing changed." }, 403);
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { change?: unknown };
      const change = ownerChangeSchema.safeParse(body.change);
      if (!change.success) return json({ error: "Check the request." }, 400);
      const planned = planOwnerChange(policyRows, change.data);
      if (!planned.ok) return json({ error: REFUSAL_WORDS[planned.reason], code: planned.reason }, planned.reason === "stale" ? 409 : 422);
      policyRows = applyPreviewPolicy(policyRows, planned.write);
      return json({ role, view: buildPolicyView(policyRows) });
    }
    const response = await base(input, init);
    if (url.pathname !== "/api/workspace" || method !== "GET" || !response.ok) return response;
    const snapshot = await response.json() as { releases?: Record<string, unknown> };
    return json({ ...snapshot, releases: { systems: false, ...snapshot.releases, needsYou: enabled } });
  };
}
