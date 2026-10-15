"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StNotice } from "@/components/ui/strelva/Kit";
import { agencyAiControlsResponseSchema, type AiControlsClient } from "@/platform/ai-controls/contracts";
import { UsageControlsPanel, type UsageDraft, type UsageSaveResult } from "./UsageControlsPanel";

type Loaded = { canChange: boolean; client: AiControlsClient; budgetEnforced: boolean; freeCapUsd: number | null };
type State = { kind: "loading" } | { kind: "off" } | { kind: "error" } | { kind: "ready"; data: Loaded };

const CONFLICT = "These controls changed since you opened them. Refresh, then save again.";

/**
 * Strelva usage for one client: what it cost this month, who limited or paused
 * it, and for an agency owner or admin the controls to change it. Renders
 * nothing while usage controls are off (the route answers 503).
 */
export function AgencyClientUsage({ agencyWorkspaceId, workspaceId, clientName, request = fetch }: { agencyWorkspaceId: string; workspaceId: string; clientName: string; request?: typeof fetch }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [saved, setSaved] = useState(false);
  const read = useCallback((value: unknown): State => {
    const parsed = agencyAiControlsResponseSchema.safeParse(value);
    const client = parsed.success ? parsed.data.clients.find(row => row.workspaceId === workspaceId) : undefined;
    if (!parsed.success || parsed.data.agencyWorkspaceId !== agencyWorkspaceId || !client) return { kind: "error" };
    return { kind: "ready", data: { canChange: parsed.data.canChange, client, budgetEnforced: parsed.data.budgetEnforced, freeCapUsd: parsed.data.freeCapUsd ?? null } };
  }, [agencyWorkspaceId, workspaceId]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await request(`/api/workspace/agency-ai-controls?${new URLSearchParams({ agencyWorkspaceId, workspaceId })}`, { credentials: "same-origin" });
        if (!live) return;
        if (response.status === 503) setState({ kind: "off" });
        else setState(response.ok ? read(await response.json()) : { kind: "error" });
      } catch { if (live) setState({ kind: "error" }); }
    })();
    return () => { live = false; };
  }, [agencyWorkspaceId, workspaceId, request, read, attempt]);

  if (state.kind === "off") return null;
  if (state.kind === "loading") return <p role="status" className="mx-2 mb-4 text-sm text-gray-muted">Checking usage…</p>;
  if (state.kind === "error") return <div className="mx-2 mb-4"><StNotice tone="critical">Usage for {clientName} could not be read. Nothing changed.</StNotice><Button variant="secondary" size="sm" onClick={() => { setState({ kind: "loading" }); setAttempt(value => value + 1); }}>Retry</Button></div>;
  const { data } = state;
  async function save(draft: UsageDraft): Promise<UsageSaveResult> {
    try {
      const response = await request("/api/workspace/agency-ai-controls", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyWorkspaceId, workspaceId, paused: draft.paused, monthlyCapCents: draft.monthlyCapCents, reviewAutoPost: draft.reviewAutoPost, expectedRevision: data.client.budget.controls.revision, reason: draft.reason }),
      });
      if (response.status === 409) return { ok: false, error: CONFLICT };
      const value = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: (value && typeof value.error === "string" && value.error) || "Usage controls were not changed. Refresh to check the current state." };
      const next = read(value);
      if (next.kind !== "ready") return { ok: false, error: "Usage controls were not confirmed. Refresh to check the current state." };
      setState(next); setSaved(true);
      return { ok: true };
    } catch { return { ok: false, error: "Usage controls were not changed. Refresh to check the current state." }; }
  }
  return <section aria-label="Strelva usage" className="mx-2 mb-4 grid gap-3">
    <h3 className="text-sm font-medium">Strelva usage</h3>
    <UsageControlsPanel key={data.client.budget.controls.revision} client={data.client} enforcement={{ budgetEnforced: data.budgetEnforced, freeCapUsd: data.freeCapUsd }} clientName={clientName} who="agency" canChange={data.canChange} save={save} saved={saved} onEdit={() => setSaved(false)} />
  </section>;
}
