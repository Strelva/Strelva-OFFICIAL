"use client";
import { useCallback, useRef, useState } from "react";
import { ContentWorkspace, type ContentWorkspaceData } from "@/experience/publishing/ContentWorkspace";
import { PUBLISHING_NEWSLETTER_CONTEXT } from "./publishing-fixture";
import { validateEntryData, type CollectionType } from "@/platform/infra/collection-types";

/** Local, fictional HTTP double. The real component handles compose/review;
 * this route has no storage, auth bypass, email or Google transport. */
export function PublishingContentPreview({ kind, state }: { kind: "website" | "newsletter"; state: string }) {
  const [initial] = useState<ContentWorkspaceData>(() => ({ permissions: { canCompose: !["read_only", "permission"].includes(state), canApprove: !["read_only", "permission"].includes(state) }, content: {
    entries: kind === "website" && state !== "empty" ? [{ type: "blog", entries: [{ slug: "holiday-hours", status: "published", data: { title: "Holiday hours at Juniper Bakery", excerpt: "A fictional post", body: "We will be closed Friday after Thanksgiving.", author: "Maria", tags: [] } }] }] : [],
    drafts: state === "empty" ? [] : [{ id: "fictional-draft", title: kind === "newsletter" ? "Approve newsletter: October: what to expect at a first session" : "Publish blog: Holiday hours", body: kind === "newsletter" ? "Most people walk into mediation expecting a courtroom. It’s closer to a long, structured conversation. Here is how Sheri runs the first hour…" : "Visit us for cardamom buns this Saturday.", status: "pending", metadata: { publishing: { data: { title: "Holiday hours", body: "We will be closed Friday after Thanksgiving." } } } }],
    outputs: kind === "newsletter" && ["ready", "accepted", "gated", "unknown", "read_only", "permission"].includes(state) ? [{ id: "fictional-issue", subject: "September issue", body: "Approved fictional words", event_id: "fictional-event", approved_at: "2026-09-15T14:00:00Z", state: "approved_sending_paused", accepted_count: 0, suppressed_count: 312, failure_count: 0,
      delivery: { state: ["ready", "accepted", "read_only", "permission"].includes(state) ? "accepted" : state === "gated" ? "not_sent_gated" : "send_unconfirmed", accepted: ["ready", "accepted", "read_only", "permission"].includes(state) ? 98 : 0, suppressed: ["ready", "accepted", "read_only", "permission"].includes(state) ? 2 : state === "gated" ? 100 : 0, unconfirmedBatches: state === "unknown" ? 1 : 0, receipts: [{ id: "fictional-receipt", detail: ["ready", "accepted", "read_only", "permission"].includes(state) ? "Provider accepted this batch; delivery is not verified." : state === "gated" ? "not sent: gated" : "Send outcome unconfirmed. Reconcile before retrying.", accepted: ["ready", "accepted", "read_only", "permission"].includes(state) ? 98 : 0, suppressed: ["ready", "accepted", "read_only", "permission"].includes(state) ? 2 : state === "gated" ? 100 : 0 }] } }] : [], receipts: [], sendingEnabled: false,
  } }));
  const data = useRef(initial);
  const request = useCallback<typeof fetch>(async (_url, options) => {
    if (state === "loading") return new Promise<Response>(() => {});
    if (state === "error") return Response.json({ error: "Publishing storage is unavailable. Your drafts are kept." }, { status: 503 });
    if (options?.method === "POST") {
      const command = JSON.parse(String(options.body)) as { action: string; eventId?: string; draft?: { subject?: string; body?: string; type?: string; slug?: string; data?: Record<string, unknown> } };
      if (command.action === "compose") {
        const draft = command.draft!;
        if (kind === "website" && !validateEntryData(draft.type as CollectionType, draft.data).success) return Response.json({ error: "Complete the collection fields before saving." }, { status: 400 });
        data.current.content.drafts.unshift({ id: `fictional-${data.current.content.drafts.length}`, title: kind === "newsletter" ? `Approve newsletter: ${draft.subject}` : `Publish ${draft.type}: ${draft.data?.title ?? draft.data?.name}`, body: draft.body ?? JSON.stringify(draft.data), status: "pending", metadata: { publishing: { ...draft } } });
      } else {
        const draft = data.current.content.drafts.find(row => row.id === command.eventId);
        if (draft) {
          draft.status = command.action === "approve" ? "approved" : "dismissed";
          if (kind === "newsletter" && command.action === "approve") data.current.content.outputs.unshift({ id: draft.id, subject: draft.title.replace("Approve newsletter: ", ""), body: draft.body, event_id: draft.id, state: "approved_sending_paused", approved_at: "2026-09-15T14:00:00Z", accepted_count: 0, suppressed_count: 312, failure_count: 0 });
          if (kind === "website" && command.action === "approve") {
            const payload = draft.metadata?.publishing ?? {};
            const type = String(payload.type ?? "blog");
            const content = payload.data as Record<string, unknown>;
            const slug = String(payload.slug ?? "holiday-hours");
            let group = data.current.content.entries.find(group => group.type === type);
            if (!group) { group = { type, entries: [] }; data.current.content.entries.push(group); }
            const before = group.entries.find(entry => entry.slug === slug) ?? null;
            group.entries = [...group.entries.filter(entry => entry.slug !== slug), { slug, status: "published", data: content }];
            (data.current.content.receipts ??= []).push({ id: draft.id, subject: draft.title, createdAt: "2026-10-07T14:00:00Z", providerRef: null, request: { type, slug, data: content }, beforeState: before, actor: "Maria", readbackDetail: "Confirmed in the fictional content store.", undoLabel: "Restore or unpublish needs a new approval." });
          }
        }
      }
      return Response.json({ result: { changed: true } });
    }
    return Response.json(data.current);
  }, [kind, state]);
  return <ContentWorkspace workspaceId="5e000000-0000-4000-8000-000000000010" systemId="5e000000-0000-4000-8000-000000000020" kind={kind} standalone newsletterContext={kind === "newsletter" ? PUBLISHING_NEWSLETTER_CONTEXT : undefined} request={request} initial={["error", "loading"].includes(state) ? undefined : initial} />;
}
