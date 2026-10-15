"use client";
import { useEffect, useState } from "react";
import { StLabel, StRow, StRows } from "@/components/ui/strelva/Kit";
import { operatorAiControlsResponseSchema, type OperatorAiControlsView } from "@/platform/ai-controls/contracts";
import { UsageControlsPanel, type UsageDraft, type UsageSaveResult } from "@/experience/workspace/agency/UsageControlsPanel";

type State = { kind: "loading" } | { kind: "off" } | { kind: "unlinked" } | { kind: "error" } | { kind: "ready"; view: OperatorAiControlsView; budgetEnforced: boolean; freeCapUsd: number | null };

const CONFLICT = "These controls changed since you opened them. Refresh, then save again.";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** Operator usage controls for one client: pause, monthly limit and review-reply hold, with the last 20 changes. */
export function OperatorUsageControls({ tenantId, request = fetch }: { tenantId: string; request?: typeof fetch }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const endpoint = `/api/admin/tenants/${encodeURIComponent(tenantId)}/ai-controls`;
  function read(value: unknown): State {
    const parsed = operatorAiControlsResponseSchema.safeParse(value);
    if (!parsed.success) return { kind: "error" };
    const { budgetEnforced, freeCapUsd, ...view } = parsed.data;
    return { kind: "ready", view, budgetEnforced, freeCapUsd: freeCapUsd ?? null };
  }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await request(endpoint, { credentials: "same-origin" });
        if (!live) return;
        if (response.status === 503) setState({ kind: "off" });
        else if (response.status === 404) setState({ kind: "unlinked" });
        else setState(response.ok ? read(await response.json()) : { kind: "error" });
      } catch { if (live) setState({ kind: "error" }); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  if (state.kind === "loading") return null;
  if (state.kind === "off") return <p className="text-xs text-gray-muted">Usage controls are off.</p>;
  if (state.kind === "unlinked") return <p className="text-xs text-gray-muted">No linked business.</p>;
  if (state.kind === "error") return <p role="alert" className="text-sm text-critical">Usage controls could not be read. Nothing changed.</p>;
  const { view } = state;
  async function save(draft: UsageDraft): Promise<UsageSaveResult> {
    try {
      const response = await request(endpoint, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: view.workspaceId, paused: draft.paused, monthlyCapCents: draft.monthlyCapCents, reviewAutoPost: draft.reviewAutoPost, expectedRevision: view.budget.controls.revision, reason: draft.reason }),
      });
      if (response.status === 409) return { ok: false, error: CONFLICT };
      const value = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: (value && typeof value.error === "string" && value.error) || "Usage controls were not changed. Refresh to check the current state." };
      const next = read(value);
      if (next.kind !== "ready") return { ok: false, error: "Usage controls were not confirmed. Refresh to check the current state." };
      setState(next);
      return { ok: true };
    } catch { return { ok: false, error: "Usage controls were not changed. Refresh to check the current state." }; }
  }
  return <section aria-label="Operator usage controls" className="grid gap-4">
    <StLabel>Operator usage controls</StLabel>
    <UsageControlsPanel key={view.budget.controls.revision} client={view} enforcement={{ budgetEnforced: state.budgetEnforced, freeCapUsd: state.freeCapUsd }} clientName={view.name} who="operator" canChange save={save} />
    {view.history.length ? <StRows label="Recent usage control changes">{view.history.map(change => <StRow key={`${change.at}:${change.reason}`} title={change.reason} detail={`${change.kind === "agency" ? change.agencyName ?? "An agency" : "A Strelva operator"} · ${when(change.at)}`} />)}</StRows> : null}
  </section>;
}
