"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import type { FoundFact } from "@/products/getting-started/contracts";

export type WaitingFactsState = { status: "idle" | "loading" } | { status: "ready"; waiting: FoundFact[] } | { status: "error" };

/**
 * The found facts still waiting for a business's owner, read from Getting
 * started (GET /api/workspace/getting-started). Day one on Home docks the
 * first one on the composer. Off (no workspace) reads nothing.
 */
export function useWaitingFacts(workspaceId: string | undefined): WaitingFactsState & { retry: () => void } {
  const transport = useWorkspaceRequest();
  const [attempt, setAttempt] = useState(0);
  // Each answer remembers which read it answers; anything older reads as loading.
  const [answer, setAnswer] = useState<{ key: string; state: WaitingFactsState } | null>(null);
  const key = workspaceId ? `${workspaceId}:${attempt}` : null;
  useEffect(() => {
    if (!workspaceId || !key) return;
    const abort = new AbortController();
    transport(`/api/workspace/getting-started?${new URLSearchParams({ workspaceId })}`, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        const body = await response.json().catch(() => null) as { business?: { waiting?: unknown } } | null;
        if (abort.signal.aborted) return;
        const waiting = body?.business?.waiting;
        setAnswer({ key, state: response.ok && Array.isArray(waiting) ? { status: "ready", waiting: waiting as FoundFact[] } : { status: "error" } });
      })
      .catch(() => { if (!abort.signal.aborted) setAnswer({ key, state: { status: "error" } }); });
    return () => abort.abort();
  }, [transport, workspaceId, key]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const state: WaitingFactsState = !key ? { status: "idle" } : answer?.key === key ? answer.state : { status: "loading" };
  return { ...state, retry };
}
