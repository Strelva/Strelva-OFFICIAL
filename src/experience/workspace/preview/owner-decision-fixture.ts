import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";

export type OwnerDecisionPreviewState = "ready" | "loading" | "empty" | "error" | "permission";
export const ownerDecisionWorkspace = "a0000000-0000-4000-8000-000000000001";
/** Fictional proposed form. No customer records, calendar, website or provider is read. */
export const sessionDateDecision: OwnerDecision = {
  id: "d0000000-0000-4000-8000-000000000081", workspaceId: ownerDecisionWorkspace,
  systemId: "b0000000-0000-4000-8000-000000000081", kind: "system.go_live", route: "owner_decides",
  title: "Let attorneys request a session date", detail: "This is the form attorneys would see on the fictional website.",
  approveEffect: "The proposed form is accepted in this local rehearsal. No website changes.", notYetEffect: "The form stays a draft. Nothing is booked.",
  sourceLifecycle: "website_document", sourceId: "fictional-session-form", revisionHash: "8".repeat(64),
  urgent: false, signInRequired: true, adminMayDecide: false, openHref: null, state: "open", outcome: null,
  outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "suppressed",
  operatorNote: null, actor: { kind: "platform" }, openedAt: "2026-10-09T13:00:00Z", expiresAt: "2026-10-23T13:00:00Z",
  reminded1At: null, reminded2At: null, deliveries: [],
  review: ["Add a session-date request form to the fictional website.", "Attorneys choose half-day or full-day and an offered date.", "Requests land in Mediation sessions for the owner to confirm. Nothing is booked without the owner."],
};

export const fictionalReceiptGroups: readonly { source: string; receipts: HandledReceipt[] }[] = [
  { source: "Inquiries", receipts: [{ id: "fictional-reply", store: "owner_decisions", systemId: null, actor: { kind: "platform" }, sentence: "Strelva sent the fictional standard first reply", at: "2026-10-09T18:41:00Z", changed: "Reply to a fictional inquiry", evidence: { providerAccepted: true, readBack: "not_verified" }, undo: { state: "not_undoable", reason: "This fictional send was accepted; delivery has not been confirmed." } }] },
  { source: "Fictional website", receipts: [{ id: "fictional-link", store: "business_record_revisions", systemId: null, actor: { kind: "platform" }, sentence: "Strelva fixed a fictional link to the fees page", at: "2026-10-08T14:20:00Z", changed: "About → fees", evidence: { providerAccepted: true, readBack: "verified" }, undo: { state: "undo" } }] },
];

/** In-memory transport only. Unknown reads and writes never reach fetch or a provider. */
export function createOwnerDecisionTransport(state: OwnerDecisionPreviewState): typeof fetch {
  let items = state === "empty" ? [] : [sessionDateDecision];
  let receipts = fictionalReceiptGroups.flatMap(group => group.receipts);
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://fixture.invalid");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/workspace/needs-you" && method === "GET") {
      if (url.searchParams.get("workspaceId") !== ownerDecisionWorkspace) return Response.json({ error: "Unknown fictional business." }, { status: 403 });
      if (state === "loading") return new Promise<Response>(() => {});
      if (state === "error") return Response.json({ error: "Fictional read failed. No records changed." }, { status: 503 });
      return Response.json({ role: state === "permission" ? "member" : "owner", items, complete: true, handled: state === "empty" ? [] : receipts, handledAvailable: true });
    }
    if (state === "permission") return Response.json({ status: "forbidden" }, { status: 403 });
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(typeof init?.body === "string" ? init.body : "{}"); } catch { return Response.json({ error: "Invalid local decision." }, { status: 400 }); }
    if (body.workspaceId !== ownerDecisionWorkspace) return Response.json({ status: "forbidden" }, { status: 403 });
    if (url.pathname === "/api/workspace/needs-you" && method === "POST") {
      if (!["approve", "not_yet"].includes(String(body.decision))) return Response.json({ error: "Choose the item's own control." }, { status: 400 });
      const item = items.find(value => value.id === body.itemId && value.revisionHash === body.revision);
      if (!item) return Response.json({ status: "changed" }, { status: 409 });
      items = items.filter(value => value.id !== item.id);
      return Response.json({ status: "done" });
    }
    if (url.pathname === "/api/workspace/needs-you/undo" && method === "POST") {
      const receipt = receipts.find(value => value.id === body.receiptId && value.undo.state === "undo");
      if (!receipt) return Response.json({ error: "This fictional receipt cannot be undone." }, { status: 409 });
      receipts = receipts.map(value => value.id === receipt.id ? { ...value, undo: { state: "undone" } } : value);
      return Response.json({ result: { revision: 1 } });
    }
    return Response.json({ error: "This local fixture has no other reads or writes." }, { status: 404 });
  };
}
