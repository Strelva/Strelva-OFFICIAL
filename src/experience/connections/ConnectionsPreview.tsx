"use client";

import { useMemo } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { WorkspaceConnection } from "@/platform/connections/contracts";
import { WorkspaceConnections } from "./WorkspaceConnections";
const business = "11111111-1111-4111-8111-111111111111";
const agency = "22222222-2222-4222-8222-222222222222";
const system = "33333333-3333-4333-8333-333333333333";
export function ConnectionsPreview({ state, kind, mode }: { state: string; kind: "customer" | "agency"; mode: string }) {
  const workspaceId = kind === "agency" ? agency : business;
  const request = useMemo<typeof fetch>(() => async (input, init) => {
    if (!String(input).startsWith("/api/workspace/connections?")) throw new Error("Outside fixture requests blocked");
    if (state === "loading") return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    if (state === "error") return Response.json({ error: "Fictional source failure" }, { status: 503 });
    if (state === "permission") return Response.json({ error: "Not allowed" }, { status: 403 });
    const rows: WorkspaceConnection[] = [{ ref: "google_business_profile:harbor", provider: "google_business_profile", workspaceId, accountLabel: "Harbor Dental · Main Street", accountHolder: { kind: "agency", workspaceId: agency }, accessThrough: { kind: "agency", workspaceId: agency }, state: "connected", unavailableReason: null, connectedAt: "2026-10-14T12:00:00Z", systemIds: [system] },
      { ref: "resend:harbor", provider: "resend", workspaceId, accountLabel: "Business email", accountHolder: { kind: "platform" }, accessThrough: { kind: "platform" }, state: "connected", unavailableReason: null, connectedAt: null, systemIds: [] },
      { ref: "calendly:legacy", provider: "calendly", workspaceId, accountLabel: "Harbor Dental appointments", accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" }, state: "stale", unavailableReason: null, connectedAt: null, systemIds: [] }];
    if (state === "unavailable") rows[0] = { ...rows[0]!, state: "unavailable", unavailableReason: "coming_soon" };
    return Response.json({ connections: state === "empty" || state === "coming-soon" ? [] : rows, sourceErrors: state === "partial" ? ["instagram"] : [],
      ...(state === "coming-soon" ? { providerEligibility: { google_business_profile: { eligible: false, reason: "coming_soon", message: "Google Business Profile for businesses on Strelva is coming soon." } } } : {}),
    });
  }, [state, workspaceId]);
  return <div data-workspace-theme="linen" data-workspace-mode={mode}><StrelvaShell connectionsAvailable active="connections" workspaceName={kind === "agency" ? "North Studio" : "Harbor Dental"} workspaceId={workspaceId} title="Connections" accountName="You" signOut={null} systemsReleased agencyNavigation={kind === "agency" ? { active: "home" } : undefined}>
    <WorkspaceConnections key={`${workspaceId}:${state}`} workspaceId={workspaceId} workspaceKind={kind} workspaceName={kind === "agency" ? "North Studio" : "Harbor Dental"} names={new Map([[agency, "North Studio"]])} systems={[{ id: system, name: "Google listing" }]} canManage request={request} />
    <p className="text-xs text-gray-muted">Fictional preview. No account is connected and no provider is called.</p>
  </StrelvaShell></div>;
}
