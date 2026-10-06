/**
 * Local fixture for Needs you and Strelva handled on Home. Fictional asks for
 * The Mooney Firm (spec section 1). Nothing leaves the browser; decisions
 * only change this in-memory list.
 */
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";

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
  { id: "record:14", store: "business_record_revisions", systemId: null, sentence: "Strelva updated your hours in your business record", at: "2026-10-06T14:10:00Z", changed: "hours", evidence: null, undo: { state: "undo" } },
  { id: "tenant_event:evt-9", store: "tenant_events", systemId: null, sentence: "Strelva replied to Dana's review on Google", at: "2026-10-05T21:02:00Z", changed: null, evidence: { providerAccepted: true, readBack: "verified" }, undo: { state: "not_undoable", reason: "Google has the reply; delete it on Google." } },
  { id: "tenant_event:evt-7", store: "tenant_events", systemId: null, sentence: "Strelva updated your website: Friday hours", at: "2026-10-05T14:12:00Z", changed: "hours", evidence: null, undo: { state: "undo_needs_review", reason: "Undo drafts a revert that Strelva reviews before it goes live." } },
];

/** Answers /api/workspace/needs-you for the Mooney scenarios and adds the release to snapshots. */
export function withNeedsYouPreview(base: typeof fetch, scenario: string, enabled: boolean): typeof fetch {
  let items = scenario === "mooney-empty" ? [] : initialItems();
  let handled = scenario === "mooney-empty" ? [] : [...HANDLED];
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
    const response = await base(input, init);
    if (url.pathname !== "/api/workspace" || method !== "GET" || !response.ok) return response;
    const snapshot = await response.json() as { releases?: Record<string, unknown> };
    return json({ ...snapshot, releases: { systems: false, ...snapshot.releases, needsYou: enabled } });
  };
}
