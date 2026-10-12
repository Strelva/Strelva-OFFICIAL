"use client";

import { useCallback } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { DeliveryCommitmentPanel } from "@/experience/operations/DeliveryCommitmentPanel";
import type { DeliveryInspection } from "@/experience/operations/delivery-client";
import { WorkspaceRequestContext } from "../WorkspaceRequest";
import { OwnerRequestConversationPreview } from "./OwnerRequestConversationPreview";

export type OwnerRequestPreviewState = "ready" | "proposed" | "asked" | "loading" | "empty" | "error" | "permission" | "readonly";
const requestId = "a1000000-0000-4000-8000-000000000010";
const businessId = "a1000000-0000-4000-8000-000000000011";
const actorId = "a1000000-0000-4000-8000-000000000012";

/** Fictional retained request only. This transport has no server or provider writes. */
function fixture(state: OwnerRequestPreviewState): DeliveryInspection {
  return {
    actorId,
    request: {
      id: requestId, businessId, status: "requested", revision: 3,
      request: "Keep the workshop’s service descriptions and contact details clear on a rebuilt website.",
      outcome: "Rebuild the Fictional Workshop website", context: {}, scope: ["website_delivery"],
      provider: { kind: "strelva" },
      providerAcceptance: { status: state === "asked" ? "pending" : "accepted", actorId: state === "asked" ? null : actorId, acceptedAt: state === "asked" ? null : "2026-10-07T12:00:00Z", note: null },
      installationId: null, deliveryId: null, createdBy: actorId,
      createdAt: "2026-10-07T10:00:00Z", updatedAt: "2026-10-08T12:00:00Z",
      deliveryCommitment: state === "asked" ? null : {
        version: 1, status: state === "proposed" ? "proposed" : "running", operatorId: actorId,
        termsReference: "Fictional agreed website scope",
        deliveryDefinition: "A rebuilt website with the workshop’s confirmed service descriptions and contact details, ready for review on desktop and phone.",
        scope: ["website_delivery"], proposedAt: "2026-10-07T13:00:00Z",
        startedAt: state === "proposed" ? null : "2026-10-08T12:00:00Z", dueAt: state === "proposed" ? null : "2026-10-09T12:00:00Z",
        customerAcceptedBy: state === "proposed" ? null : actorId, customerAcceptedAt: state === "proposed" ? null : "2026-10-08T12:00:00Z",
        blocker: null, result: null, decision: null,
      },
    },
    permissions: { canManage: state !== "readonly", canOperate: false, stopped: false, websiteBindings: [] },
  };
}

export function OwnerRequestPreview({ state, dark }: { state: OwnerRequestPreviewState; dark: boolean }) {
  const transport = useCallback<typeof fetch>(async (input, init) => {
    if (init?.method === "POST") return Response.json({ error: { message: "Fictional preview: no decision was saved." } }, { status: 403 });
    if (String(input) !== `/api/service-requests/delivery?requestId=${requestId}`) return Response.json({ error: { message: "This fixture has no other reads." } }, { status: 404 });
    if (state === "loading") return new Promise<Response>(() => {});
    if (state === "permission") return Response.json({ error: { message: "This request is unavailable to your account." } }, { status: 403 });
    if (state === "empty") return Response.json({ error: { message: "No saved request is available here." } }, { status: 404 });
    if (state === "error") return Response.json({ error: { message: "The request could not be checked. Its saved records are unchanged." } }, { status: 503 });
    return Response.json(fixture(state));
  }, [state]);
  return <div data-workspace-theme="linen" data-workspace-mode={dark ? "dark" : "light"}>
    <WorkspaceRequestContext.Provider value={transport}>
      <StrelvaShell title="Requests" active="requests" systemsReleased workspaceName="Fictional Workshop" accountName="Fictional owner" signOut={<span>Local preview</span>}
        notice={<p role="note" className="px-5 py-3 text-sm text-gray-muted">Local rehearsal · fictional request. No decision, publication or provider write is saved.</p>}
      ><DeliveryCommitmentPanel key={state} requestId={requestId}>{["ready", "proposed", "readonly"].includes(state) ? <OwnerRequestConversationPreview key={`conversation:${state}`} readOnly={state === "readonly"} /> : null}</DeliveryCommitmentPanel></StrelvaShell>
    </WorkspaceRequestContext.Provider>
  </div>;
}
