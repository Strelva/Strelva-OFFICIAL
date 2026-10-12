"use client";

import { useMemo } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StHead, StPage } from "@/components/ui/strelva/Kit";
import { BringInAgency } from "../BringInAgency";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { AgencyProposals } from "../agency/AgencyProposals";

const BUSINESS = "d2950000-0000-4000-8000-000000000001";
const STRELVA_AGENCY = "d2950000-0000-4000-8000-0000000000a1";
const NORTH = "d2950000-0000-4000-8000-0000000000a2";
const NORTH_BRAND: OwnerBrand = { agencyId: NORTH, name: "North Studio", accentColor: "#2563eb", replyTo: "hello@north.example", logoUrl: null, credit: "runs_on_strelva" };
const agencyNavigation = { active: "queue" as const, hrefs: { clients: "/preview/strelva/agency-portfolio", queue: "/preview/strelva/two-doors?surface=agency", library: "/preview/strelva/agency-library", team: "/preview/strelva/agency-people?surface=team" } };

export function twoDoorsPreviewTransport(state: string): typeof fetch {
    const directory = [
      { agencyWorkspaceId: NORTH, name: "North Studio", summary: "Websites and booking for dental and health practices." },
      { agencyWorkspaceId: STRELVA_AGENCY, name: "Strelva Agency", summary: "Managed websites, done for you." },
    ];
    let agencies: Array<{ agencyWorkspaceId: string; name: string; seat: boolean; ofRecord: boolean; scopes: Array<{ scope: string; level: string; status: string }> }> = state === "with-agency" ? [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes: [{ scope: "website", level: "full_control", status: "active" }, { scope: "google", level: "prepare", status: "active" }] }] : [];
    let accepted = state === "empty";
    let listed = true;
    return async (input, init) => {
    const url = String(input);
    if (state === "loading") return new Promise<Response>(() => undefined);
    if (state === "error") return Response.json({ error: "Agencies couldn't be loaded. Nothing changed." }, { status: 503 });
    if (url.startsWith("/api/workspace/agencies")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { agencyWorkspaceId: string; scopes: Array<{ scope: string; level: string }> };
        const chosen = directory.find(agency => agency.agencyWorkspaceId === body.agencyWorkspaceId)!;
        agencies = [...agencies.filter(agency => agency.agencyWorkspaceId !== chosen.agencyWorkspaceId), { agencyWorkspaceId: chosen.agencyWorkspaceId, name: chosen.name, seat: false, ofRecord: false, scopes: body.scopes.map(item => ({ ...item, status: "proposed" })) }];
        return Response.json({ agencies });
      }
      if (init?.method === "DELETE") {
        const body = JSON.parse(String(init.body)) as { agencyWorkspaceId: string };
        agencies = agencies.filter(agency => agency.agencyWorkspaceId !== body.agencyWorkspaceId);
        return Response.json({ agencies });
      }
      return Response.json({ directory, agencies });
    }
    if (url.startsWith("/api/workspace/agency-proposals")) {
      if (init?.method === "POST") { accepted = true; return Response.json({ status: "accepted" }); }
      return Response.json({ proposals: accepted ? [] : [
        { businessWorkspaceId: BUSINESS, businessName: "Harbor Dental", consent: "I bring in North Studio for Website (full control), Google (prepare). I keep payment decisions and my data, and I can end their access anytime.", proposedAt: "2026-10-11T14:00:00Z", scopes: [{ scope: "website", level: "full_control" }, { scope: "google", level: "prepare" }] },
      ], listing: { listed, summary: "Websites and booking for dental and health practices." } });
    }
    if (url.startsWith("/api/workspace/agency-directory-listing")) { listed = JSON.parse(String(init?.body ?? "{}")).listed === true; return Response.json({ listed }); }
    return Response.json({ error: "Not in this preview." }, { status: 404 });
    };
}

/** Fictional businesses and agencies (ADR 0015). Every interaction stays in this preview. */
export function TwoDoorsPreview({ surface, state, mode = "light" }: { surface: "owner" | "agency"; state: string; mode?: string }) {
  const transport = useMemo(() => twoDoorsPreviewTransport(state), [state]);
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    {surface === "owner"
      ? <StrelvaShell title="Harbor Dental" workspaceName="Harbor Dental" ownerBrand={state === "with-agency" ? NORTH_BRAND : undefined} signedIn signOut={null} accountName="Dr. Lin" accountDetail="Owner" systemsReleased>
        <StPage><StHead title="What do you need?" meta="Send a request to your agency, bring one in, or contact Strelva about the platform itself." /><BringInAgency workspaceId={BUSINESS} canManage={state !== "member"} transport={transport} /></StPage>
      </StrelvaShell>
      : <StrelvaShell title="North Studio" workspaceName="North Studio" ownerBrand={NORTH_BRAND} agencyNavigation={agencyNavigation} signedIn signOut={null} accountName="Sam Rivera" accountDetail="Agency owner" systemsReleased>
        <StPage><StHead title="Queue" meta="Oldest first within each kind." /><AgencyProposals agencyWorkspaceId={NORTH} agencyName="North Studio" canManage transport={transport} /></StPage>
      </StrelvaShell>}
    <p className="px-6 pb-6 text-xs text-gray-muted">Fictional preview · no agency, request or listing changes.</p>
  </div>;
}
