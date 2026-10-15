"use client";
import { ListingsSyncPanel } from "@/experience/listings-sync/ListingsSyncPanel";
import { ListingsSyncSummary } from "@/experience/listings-sync/ListingsSyncSummary";
import { agencyWaiting, matches, noAgency, twoDiffer, waitingOnGoogle } from "./fixture";

const WS = "29100000-0000-4000-8000-000000000010";
const noRequest: typeof fetch = async () => new Response("{}", { status: 404 });
const agencyRequest: typeof fetch = async () => Response.json(agencyWaiting);

export function ListingsSyncFixtures() {
  return <div className="grid gap-12">
    <section aria-label="Everything matches"><h2 className="mb-3 text-xs text-gray-muted">a · Everything matches, Release 3</h2>
      <ListingsSyncPanel workspaceId={WS} request={noRequest} viewerIsOwner businessName="Harbor Dental" initial={matches} /></section>
    <section aria-label="Two places differ"><h2 className="mb-3 text-xs text-gray-muted">b · 2 places differ, owner viewing</h2>
      <ListingsSyncPanel workspaceId={WS} request={noRequest} viewerIsOwner businessName="Harbor Dental" initial={twoDiffer} /></section>
    <section aria-label="Waiting on Google"><h2 className="mb-3 text-xs text-gray-muted">c · Waiting on Google, website matches</h2>
      <ListingsSyncPanel workspaceId={WS} request={noRequest} viewerIsOwner businessName="Harbor Dental" initial={waitingOnGoogle} /></section>
    <section aria-label="No agency"><h2 className="mb-3 text-xs text-gray-muted">d · No agency: change it yourself</h2>
      <ListingsSyncPanel workspaceId={WS} request={noRequest} viewerIsOwner businessName="Harbor Dental" initial={noAgency} /></section>
    <section aria-label="Agency viewing"><h2 className="mb-3 text-xs text-gray-muted">e · Agency viewing, waiting on the owner</h2>
      <ListingsSyncPanel workspaceId={WS} request={agencyRequest} viewerIsOwner={false} businessName="North Studio" initial={agencyWaiting} />
      <div className="mt-4"><ListingsSyncSummary workspaceId={WS} clientName="North Studio" request={agencyRequest} /></div></section>
  </div>;
}
