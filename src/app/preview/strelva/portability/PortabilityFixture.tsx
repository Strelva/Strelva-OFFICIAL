"use client";

import { useMemo } from "react";
import { WorkspaceExport } from "@/experience/workspace/WorkspaceExport";
import { WorkspaceExit } from "@/experience/workspace/WorkspaceExit";
import type { WorkspaceExitOptions, WorkspaceExitState } from "@/platform/workspace-exit/contracts";

const WORKSPACE = "6e000000-0000-4000-8000-000000000010";
const BUILD = "6e000000-0000-4000-8000-000000000020";
const USER = "6e000000-0000-4000-8000-000000000030";
const HANDOFF: NonNullable<WorkspaceExitOptions["handoff"]> = {
  businessRecordRetained: true, dataDeleted: false,
  systems: [{ id: "6e000000-0000-4000-8000-000000000040", name: "Harbor Workshop website", lifecycle: "live" }],
  sites: [{ tenantId: "harbor-fixture", tenantStableId: "6e000000-0000-4000-8000-000000000050", siteName: "Harbor Workshop — Buffalo", steps: [
    { kind: "export", status: "completed", detail: "Export the business record and every linked System.", evidence: "Business archive prepared; owner download available for seven days." },
    { kind: "files", status: "pending", detail: "Hand over the repository, website files and assets." },
    { kind: "billing", status: "pending", detail: "Review billing cancellation with the owner. No charge has changed." },
    { kind: "domain", status: "pending", detail: "Arrange the domain move. No DNS change has been made." },
  ] }],
};
const COMPLETED: WorkspaceExitState = {
  id: "6e000000-0000-4000-8000-000000000060", workspaceId: WORKSPACE, status: "completed",
  requestedAt: "2026-10-07T12:00:00.000Z", completedAt: "2026-10-07T12:01:00.000Z", requestedBy: USER,
  futureWork: "paused", providerParticipation: "revoked", maintainedResources: { kind: "stopped" },
  summary: { standingPaused: 1, standingRevoked: 0, scheduledPaused: 2, scheduledCancelled: 0, assignmentsRevoked: 1, providerDeliveriesRevoked: 1, investigationsPaused: 2, retainedAccepted: 1, retainedUnknown: 1 },
  retainedObligations: [{ workId: "6e000000-0000-4000-8000-000000000070", title: "Published opening hours", status: "accepted", effect: "accepted" },
    { workId: "6e000000-0000-4000-8000-000000000080", title: "Provider handover confirmation", status: "unknown", effect: "unknown" }],
  resources: [], handoff: HANDOFF,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Fictional state only: requests and exit choices never leave this component. */
export function PortabilityFixture({ surface, state }: { surface: "export" | "exit"; state: string }) {
  const request = useMemo<typeof fetch>(() => async (input, init) => {
    if (state === "permission") return json({ error: "Only the business owner can export records or confirm an exit." }, 403);
    if (state === "error") return json({ error: "Business records are unavailable. Nothing was changed. Try again." }, 503);
    if (surface === "exit") {
      if (state === "loading") return new Promise<Response>(() => {});
      if (init?.method === "POST") return json({ state: COMPLETED, replayed: false });
      const options: WorkspaceExitOptions = {
        state: state === "completed" ? COMPLETED : null,
        successors: state === "empty" ? [] : [{ userId: USER, email: "successor@example.test" }],
        handoff: state === "empty" ? { businessRecordRetained: true, dataDeleted: false, sites: [], systems: [] } : HANDOFF,
      };
      return json(options);
    }
    if (String(input).includes("/status?")) return json({ status: state === "loading" ? "building" : state === "failed" ? "failed" : "ready" });
    return json({ buildId: BUILD, message: "Your business export is being prepared." }, 202);
  }, [surface, state]);
  return <div onClick={event => {
    // Fixture links cannot hit the real APIs or escape into authenticated work.
    if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
  }}>
    <p className="bg-surface-raised px-6 py-3 text-xs text-gray-muted">Local preview · fictional Harbor Workshop · {surface} / {state}</p>
    {surface === "exit" ? <WorkspaceExit key={state} workspaceId={WORKSPACE} request={request} />
      : <WorkspaceExport key={state} workspaceId={WORKSPACE} schema3 request={request} />}
  </div>;
}
