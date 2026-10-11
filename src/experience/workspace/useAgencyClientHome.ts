"use client";
import { useEffect, useState } from "react";
import { agencyClientHomeSchema, type AgencyClientHome } from "./agency-client-home";
import { useWorkspaceRequest } from "./WorkspaceRequest";
export type AgencyClientHomeState = { status: "disabled" | "loading" } | { status: "error" } | { status: "ready"; data: AgencyClientHome };
/** Keyed, cancellable read projection. There is deliberately no command path. */
export function useAgencyClientHome(workspaceId: string | undefined) {
  const request = useWorkspaceRequest();
  const [result, setResult] = useState<{ workspaceId: string; state: AgencyClientHomeState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    void request(`/api/workspace/agency-client-home?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const data = agencyClientHomeSchema.parse(await response.json());
      if (data.workspaceId !== workspaceId) throw new Error("scope");
      if (!controller.signal.aborted) setResult({ workspaceId, state: { status: "ready", data } });
    }).catch(() => { if (!controller.signal.aborted) setResult({ workspaceId, state: { status: "error" } }); });
    return () => controller.abort();
  }, [workspaceId, request, attempt]);
  const state: AgencyClientHomeState = !workspaceId ? { status: "disabled" } : result?.workspaceId === workspaceId ? result.state : { status: "loading" };
  return { state, refresh: () => { setResult(null); setAttempt(value => value + 1); } };
}
