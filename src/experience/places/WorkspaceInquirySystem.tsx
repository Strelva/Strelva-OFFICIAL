"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceInquiries } from "./WorkspaceInquiries";
import type { WorkspaceLeads } from "@/products/inquiries";
import type { PlaceState } from "./WorkspacePlace";

/** Customer System surface; internal drafts and policies stay on operator views. */
export function WorkspaceInquirySystem({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = useState<PlaceState<WorkspaceLeads> | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workspace/inquiries?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.status === 403) return { kind: "permission" } as const;
        const result = await response.json() as { data?: WorkspaceLeads };
        if (!response.ok || !result.data || !Array.isArray(result.data.sites)) throw new Error("unavailable");
        return { kind: "ready", data: result.data } as const;
      }).then(next => { if (!controller.signal.aborted) setState(next); })
      .catch(() => { if (!controller.signal.aborted) setState({ kind: "error" }); });
    return () => controller.abort();
  }, [workspaceId, retry]);
  if (!state) return <p role="status" className="p-6 text-sm text-gray-muted">Opening inquiries…</p>;
  return <><WorkspaceInquiries workspaceId={workspaceId} state={state} embedded />{state.kind === "error" ? <div className="px-6 pb-6"><Button variant="secondary" onClick={() => { setState(null); setRetry(value => value + 1); }}>Try again</Button></div> : null}</>;
}
