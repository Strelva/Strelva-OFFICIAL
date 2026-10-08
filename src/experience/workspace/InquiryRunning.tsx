"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { InquirySystemDetail } from "@/products/inquiries";
import { useWorkspaceRequest } from "./WorkspaceRequest";
type Sentence = NonNullable<InquirySystemDetail["running"]>[number];
export function InquiryRunningView({ sentences }: { sentences: Sentence[] }) {
  if (!sentences.length) return null;
  return <section aria-label="Inquiry reply policies"><ul className="divide-y divide-gray-border border-y border-gray-border">{sentences.map(item => <li key={item.id} className="py-4">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="font-display text-base font-medium">{item.title}</h2><span className="text-xs text-gray-muted">{item.status === "paused" ? "Paused" : item.status === "needs_check" ? "Needs checking" : "Active policy"}</span></div>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-muted">{item.sentence}</p>
  </li>)}</ul></section>;
}
/** Uses the System's existing scoped read; never creates or runs another responsibility. */
export function InquiryRunning({ workspaceId, enabled }: { workspaceId: string; enabled: boolean }) {
  const request = useWorkspaceRequest();
  const [state, setState] = useState<{ workspaceId: string; kind: "ready" | "error" | "closed"; sentences?: Sentence[] }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void request(`/api/workspace/inquiries/system?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if ([401, 403].includes(response.status)) return { workspaceId, kind: "closed" as const };
        const body = await response.json() as { details?: InquirySystemDetail[]; error?: string };
        if (response.status === 503 && ["Inquiries aren't open yet.", "Inquiries aren't open for this business."].includes(body.error ?? "")) return { workspaceId, kind: "closed" as const };
        if (!response.ok || !Array.isArray(body.details)) throw new Error("unavailable");
        const unique = new Map<string, Sentence>();
        for (const detail of body.details) for (const item of detail.running ?? []) {
          if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.sentence !== "string"
            || !["active", "paused", "needs_check"].includes(item.status)) throw new Error("malformed");
          unique.set(item.id, item);
        }
        return { workspaceId, kind: "ready" as const, sentences: [...unique.values()] };
      }).then(next => { if (!controller.signal.aborted) setState(next); })
      .catch(() => { if (!controller.signal.aborted) setState({ workspaceId, kind: "error" }); });
    return () => controller.abort();
  }, [request, workspaceId, enabled, attempt]);
  if (!enabled) return null;
  if (!state || state.workspaceId !== workspaceId) return <p role="status" className="text-sm text-gray-muted">Checking inquiry reply policies…</p>;
  if (state.kind === "closed") return null;
  if (state.kind === "error") return <div role="alert"><p className="mb-3 text-sm text-gray-muted">Inquiry reply policies couldn’t load. Other running work is still available.</p><Button variant="secondary" onClick={() => { setState(undefined); setAttempt(value => value + 1); }}>Retry inquiry policies</Button></div>;
  return <InquiryRunningView sentences={state.sentences ?? []} />;
}
