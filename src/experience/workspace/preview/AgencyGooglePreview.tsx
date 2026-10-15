"use client";

import { AgencyConnectLinkButton } from "@/experience/places/AgencyConnectLink";
import { AgencyGooglePicker, type AgencyGoogleResult } from "@/experience/places/AgencyGooglePicker";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const choices = { googleEmail: "listings@north-studio.example", more: true, listings: [
  { accountId: "accounts/north", locationId: "harbor", title: "Harbor Dental", address: "123 Main Street, Buffalo" },
  { accountId: "accounts/north", locationId: "uptown", title: "Harbor Dental — Uptown office and family care", address: "900 Elmwood Avenue, Buffalo, New York" },
] };
/** Fictional transport only: no OAuth, provider or owner contact. */
export function AgencyGooglePreview({ state }: { state: string }) {
  if (state === "agency-options" || state === "owner-link") return <AgencyConnectLinkButton workspaceId={workspaceId} request={async () => Response.json(state === "owner-link" ? { kind: "first_connect", link: "https://strelva.example/workspace/google", message: "Connect your Google listing to Strelva: https://strelva.example/workspace/google. Sign in with the Google account that runs your Business Profile. Nothing changes on Google until you approve it." } : { kind: "agency_connect", link: `${window.location.origin}/api/oauth/google/agency?workspaceId=${workspaceId}`, message: "Connect your agency's own Google account for this business. No message is sent to the owner." })} />;
  const results: Record<string, AgencyGoogleResult> = { "agency-expired": "expired", "agency-permission": "forbidden", "agency-pending": "access_pending", "agency-empty": "no_listings", "agency-refused": "refused" };
  const result = results[state];
  return <AgencyGooglePicker workspaceId={workspaceId} choices={result ? null : choices} result={result}
    request={async () => state === "agency-loading" ? new Promise<Response>(() => undefined) : state === "agency-error" ? Response.json({ error: "Fixture unavailable" }, { status: 503 }) : Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?fixture=1" })} navigate={() => undefined} />;
}
