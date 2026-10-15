"use client";

import { useMemo } from "react";
import { AgencyLibraryView } from "@/experience/workspace/agency/AgencyLibraryView";
import type { AgencyLibrary } from "@/experience/workspace/agency-clients";

const agencyWorkspaceId = "bb000000-0000-4000-8000-000000000010";
/** Real Library composition with disposable, fictional responses only. */
export function ConnectionsLibraryPreview({ state }: { state: string }) {
  const request = useMemo<typeof fetch>(() => async input => {
    const url = new URL(String(input), "http://fixture.test");
    if (state === "loading") return new Promise<Response>(() => {});
    if (state === "error" || state === "permission") return Response.json({ error: state === "permission" ? "You do not have access to this Library." : "Library unavailable." }, { status: state === "permission" ? 403 : 503 });
    if (url.pathname === "/api/workspace/agency-library") {
      const library: AgencyLibrary = { agencyWorkspaceId, reviewEnabled: true, sources: state === "empty" ? [] : [
        { systemId: "bb000000-0000-4000-8000-000000000020", workspaceId: agencyWorkspaceId, name: "Harbor Dental inquiries", hidden: false, revisions: [{ number: 1, label: null, summary: "Route new patient inquiries to the team.", publishedAt: "2026-10-14T12:00:00Z", ...(state === "unknown" ? {} : { requiredConnections: [{ provider: "resend" as const, access: "act" as const, optional: false, purpose: "Send inquiry routing messages." }] }) }], versions: [] },
        { systemId: "bb000000-0000-4000-8000-000000000021", workspaceId: agencyWorkspaceId, name: "Twin Trees FAQ", hidden: false, revisions: [{ number: 1, label: null, summary: "Add common questions to the website.", publishedAt: "2026-10-14T12:00:00Z", requiredConnections: [] }], versions: [] },
      ] };
      return Response.json(library);
    }
    // Source detail is read-only in this preview; no mutation transport exists.
    if (url.pathname === "/api/workspace/packages") return Response.json({ workspaceId: agencyWorkspaceId, systemId: url.searchParams.get("sourceSystemId"), source: { listingState: "private" }, revision: null, canReview: false });
    return Response.json({ error: "Unavailable in this fictional preview." }, { status: 404 });
  }, [state]);
  return <AgencyLibraryView key={state} request={request} agencyWorkspaceId={agencyWorkspaceId} onWorkspace={() => undefined} />;
}
