"use client";
import { useCallback, useRef } from "react";
import { ContentWorkspace, type ContentWorkspaceData } from "@/experience/publishing/ContentWorkspace";

/** Local, fictional HTTP double. The real component handles compose/review;
 * this route has no storage, auth bypass, email or Google transport. */
export function PublishingContentPreview({ kind, state }: { kind: "website" | "newsletter"; state: string }) {
  const data = useRef<ContentWorkspaceData>({ permissions: { canCompose: state !== "read_only", canApprove: state !== "read_only" }, content: {
    entries: kind === "website" && state !== "empty" ? [{ type: "blog", entries: [{ slug: "holiday-hours", status: "published", data: { title: "Holiday hours at Juniper Bakery", excerpt: "A fictional post", body: "We will be closed Friday after Thanksgiving.", author: "Maria", tags: [] } }] }] : [],
    drafts: state === "empty" ? [] : [{ id: "fictional-draft", title: kind === "newsletter" ? "Approve newsletter: November at Juniper" : "Publish blog: Holiday hours", body: "Visit us for cardamom buns this Saturday.", status: "pending", metadata: { publishing: { data: { title: "Holiday hours", body: "We will be closed Friday after Thanksgiving." } } } }],
    outputs: [], receipts: [], sendingEnabled: false,
  } });
  const request = useCallback<typeof fetch>(async (_url, options) => {
    if (state === "loading") await new Promise(resolve => setTimeout(resolve, 1500));
    if (state === "error") return Response.json({ error: "Publishing storage is unavailable. Your drafts are kept." }, { status: 503 });
    if (options?.method === "POST") {
      const command = JSON.parse(String(options.body)) as { action: string; eventId?: string; draft?: { subject?: string; body?: string; type?: string; data?: Record<string, unknown> } };
      if (command.action === "compose") {
        const draft = command.draft!;
        data.current.content.drafts.unshift({ id: `fictional-${data.current.content.drafts.length}`, title: kind === "newsletter" ? `Approve newsletter: ${draft.subject}` : `Publish ${draft.type}: ${draft.data?.title ?? draft.data?.name}`, body: draft.body ?? JSON.stringify(draft.data), status: "pending", metadata: { publishing: { ...draft } } });
      } else {
        const draft = data.current.content.drafts.find(row => row.id === command.eventId);
        if (draft) {
          draft.status = command.action === "approve" ? "approved" : "dismissed";
          if (kind === "newsletter" && command.action === "approve") data.current.content.outputs.push({ id: draft.id, subject: draft.title.replace("Approve newsletter: ", ""), body: draft.body, event_id: draft.id, state: "approved_sending_paused", approved_at: "2026-10-07T14:00:00Z", accepted_count: 0, suppressed_count: 312, failure_count: 0 });
        }
      }
      return Response.json({ result: { changed: true } });
    }
    return Response.json(data.current);
  }, [kind, state]);
  return <ContentWorkspace workspaceId="5e000000-0000-4000-8000-000000000010" systemId="5e000000-0000-4000-8000-000000000020" kind={kind} request={request} initial={["error", "loading"].includes(state) ? undefined : data.current} />;
}
