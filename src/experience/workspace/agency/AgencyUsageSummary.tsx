"use client";
import { useState } from "react";
import { StRow, StRows } from "@/components/ui/strelva/Kit";
import { agencyAiControlsResponseSchema, aiUsageLine, type AiControlsClient } from "@/platform/ai-controls/contracts";
import { resetDate } from "./UsageControlsPanel";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "off" } | { kind: "error" } | { kind: "ready"; clients: AiControlsClient[]; budgetEnforced: boolean; freeCapUsd: number | null };

/**
 * Where Strelva work stands across the agency's clients this month, as
 * exceptions only: paused, stopped at a limit, or review replies held. Usage is
 * measured only in dollars and no figure shows until pricing is decided, so
 * this names states, never amounts. Read-only; loads when opened and renders
 * nothing while controls are off.
 */
export function AgencyUsageSummary({ agencyWorkspaceId, request = fetch }: { agencyWorkspaceId: string; request?: typeof fetch }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  async function load() {
    setState({ kind: "loading" });
    try {
      const response = await request(`/api/workspace/agency-ai-controls?${new URLSearchParams({ agencyWorkspaceId })}`, { credentials: "same-origin" });
      if (response.status === 503) { setState({ kind: "off" }); return; }
      const parsed = response.ok ? agencyAiControlsResponseSchema.safeParse(await response.json()) : null;
      setState(parsed?.success && parsed.data.agencyWorkspaceId === agencyWorkspaceId ? { kind: "ready", clients: parsed.data.clients, budgetEnforced: parsed.data.budgetEnforced, freeCapUsd: parsed.data.freeCapUsd ?? null } : { kind: "error" });
    } catch { setState({ kind: "error" }); }
  }
  if (state.kind === "off") return null;
  const rows = state.kind === "ready" ? state.clients.map(client => ({ client, line: aiUsageLine(client, state) }))
    .map(row => ({ ...row, atLimit: row.line.limitUsd !== null && row.line.usedUsd >= row.line.limitUsd }))
    .filter(row => row.client.budget.controls.paused || row.atLimit || row.client.budget.controls.reviewAutoPost === "held" || row.line.unknown) : [];
  return <details className="pt-6" onToggle={event => { if (event.currentTarget.open && state.kind === "idle") void load(); }}>
    <summary className="flex min-h-11 cursor-pointer items-center text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2">Strelva work paused or limited this month</summary>
    {state.kind === "loading" ? <p role="status" className="py-3 text-sm text-gray-muted">Checking usage…</p> : null}
    {state.kind === "error" ? <p role="alert" className="py-3 text-sm text-critical">Usage could not be read. Nothing changed. <button type="button" className="underline" onClick={() => void load()}>Retry</button></p> : null}
    {state.kind === "ready" ? <div className="grid gap-3 py-3">
      {rows.length ? <StRows label="Strelva work paused or limited, by client">{rows.map(({ client, line, atLimit }) => {
        const controls = client.budget.controls;
        const status = controls.paused ? "Paused" : atLimit ? `Limit reached · starts again ${resetDate(line.resetsAt)}` : "Running";
        return <StRow key={client.workspaceId} title={client.name} detail={[controls.reviewAutoPost === "held" ? "Review replies held" : null, line.unknown ? "Some calls have no recorded cost" : null].filter(Boolean).join(" · ") || undefined} href={`/workspace?${new URLSearchParams({ workspaceId: client.workspaceId })}`} end={status} />;
      })}</StRows> : <p className="text-sm text-gray-muted">Strelva work is running for every client. Nothing is paused or limited.</p>}
    </div> : null}
  </details>;
}
