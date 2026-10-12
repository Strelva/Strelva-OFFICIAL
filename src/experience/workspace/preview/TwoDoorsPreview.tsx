"use client";

import { useMemo } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StHead, StPage } from "@/components/ui/strelva/Kit";
import { BringInAgency } from "../BringInAgency";
import { AgencyProposals } from "../agency/AgencyProposals";

const BUSINESS = "d2950000-0000-4000-8000-000000000001";
const STRELVA_AGENCY = "d2950000-0000-4000-8000-0000000000a1";
const NORTH = "d2950000-0000-4000-8000-0000000000a2";

/** Fictional businesses and agencies (ADR 0015). Every interaction stays in this preview. */
export function TwoDoorsPreview({ surface, state, mode = "light" }: { surface: "owner" | "agency"; state: string; mode?: string }) {
  const transport = useMemo<typeof fetch>(() => async (input, init) => {
    const url = String(input);
    if (state === "loading") return new Promise<Response>(() => undefined);
    if (state === "error") return Response.json({ error: "Agencies couldn't be loaded. Nothing changed." }, { status: 503 });
    const directory = [
      { agencyWorkspaceId: NORTH, name: "North Studio", summary: "Websites and booking for dental and health practices." },
      { agencyWorkspaceId: STRELVA_AGENCY, name: "Strelva Agency", summary: "Managed websites, done for you." },
    ];
    const agencies = state === "with-agency" ? [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes: [{ scope: "website", level: "full_control", status: "active" }, { scope: "google", level: "prepare", status: "active" }] }] : [];
    if (url.startsWith("/api/workspace/agencies")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { agencyWorkspaceId: string; scopes: Array<{ scope: string; level: string }> };
        const chosen = directory.find(agency => agency.agencyWorkspaceId === body.agencyWorkspaceId)!;
        return Response.json({ agencies: [...agencies, { agencyWorkspaceId: chosen.agencyWorkspaceId, name: chosen.name, seat: false, ofRecord: false, scopes: body.scopes.map(item => ({ ...item, status: "proposed" })) }] });
      }
      return Response.json({ directory, agencies });
    }
    if (url.startsWith("/api/workspace/agency-proposals")) {
      if (init?.method === "POST") return Response.json({ status: "accepted" });
      return Response.json({ proposals: state === "empty" ? [] : [
        { businessWorkspaceId: BUSINESS, businessName: "Harbor Dental", consent: "I bring in North Studio for Website (full control), Google (prepare). I keep payment decisions and my data, and I can end their access anytime.", proposedAt: "2026-10-11T14:00:00Z", scopes: [{ scope: "website", level: "full_control" }, { scope: "google", level: "prepare" }] },
      ], listing: { listed: true, summary: "Websites and booking for dental and health practices." } });
    }
    if (url.startsWith("/api/workspace/agency-directory-listing")) return Response.json({ listed: JSON.parse(String(init?.body ?? "{}")).listed });
    return Response.json({ error: "Not in this preview." }, { status: 404 });
  }, [state]);
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    {surface === "owner"
      ? <StrelvaShell title="Harbor Dental" context={<span>Harbor Dental</span>} accountName="Dr. Lin" accountDetail="Owner" systemsReleased>
        <StPage><StHead title="What do you need?" meta="Send a request to your agency, bring one in, or contact Strelva about the platform itself." /><BringInAgency workspaceId={BUSINESS} canManage={state !== "member"} transport={transport} /></StPage>
      </StrelvaShell>
      : <StrelvaShell title="North Studio" context={<span>North Studio</span>} accountName="You" accountDetail="Agency owner" systemsReleased>
        <StPage><StHead title="Queue" meta="Oldest first within each kind." /><AgencyProposals agencyWorkspaceId={NORTH} agencyName="North Studio" canManage transport={transport} /></StPage>
      </StrelvaShell>}
    <p className="px-6 pb-6 text-xs text-gray-muted">Fictional preview · no agency, request or listing changes.</p>
  </div>;
}
