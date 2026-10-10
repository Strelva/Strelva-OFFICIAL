"use client";

import { useEffect, useRef } from "react";
import { AgencyProspectsView } from "@/experience/workspace/agency/AgencyProspectsView";
import { HomeFinderBuyer } from "@/experience/enterprise/HomeFinderBuyer";
import type { AgencyProspect } from "@/platform/agency-prospecting/server";

/** All names, listing content, counts and receipts below are fictional. No provider is called. */
const workspaceId = "b2770000-0000-4000-8000-000000000010";
const prospects: AgencyProspect[] = [{ id: "b2770000-0000-4000-8000-000000000011", name: "[Business owner]", email: "owner@example.test", business: "[Prospect business]", url: "https://business.example.test", source: "audit", result_id: "fictional", score: 64, grade: "C", created_at: "2026-10-09T14:00:00Z" }];

const listing = { id: "fictional-home", inquiryToken: "fictional-inquiry-token", address: { line: "[Home address]", city: "[City]", state: "NY", postalCode: "[Postal code]", latitude: null, longitude: null }, price: 325000, bedrooms: 3, bathrooms: 2, publicRemarks: "Fictional listing for a local presentation check.", photos: [], listAgentName: "[Listing contact]", listOfficeName: "[Brokerage]", sourceSystemName: "Fictional licensed source", modifiedAt: null, status: "active" };

function fixtureRequest(state: string): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.searchParams.has("renew")) return Response.json({ token: "fictional-entry-token" });
    if (state === "loading") return new Promise<Response>(() => {});
    if (state === "error" || state === "permission") return Response.json({}, { status: state === "permission" ? 403 : 503 });
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { submissionId: string };
      return Response.json({ status: "pending", requestId: body.submissionId, reference: "fictional-receipt", message: "Inquiry queued · delivery not verified" });
    }
    if (url.searchParams.has("receipt")) return Response.json({ installationId: "fictional-installation", reference: "fictional-receipt", state: "pending", occurredAt: "2026-10-09T14:00:00Z", expiresAt: "2026-10-10T14:00:00Z", observedAt: "2026-10-09T14:00:00Z", schemaVersion: "1" });
    return Response.json({ source: { id: "trestle", name: "Fictional licensed source", mode: "live", isLive: true, description: "Fixture only", freshnessWindowMinutes: 30 }, fetchedAt: "2026-10-09T14:00:00Z", sourceCheckedAt: "2026-10-09T14:00:00Z", count: state === "empty" ? 0 : 1, listings: state === "empty" ? [] : [listing] });
  };
}

export function L13RemainingPreview({ surface, state, mode }: { surface: string; state: string; mode: string }) {
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A fixture-only search makes each URL reproducible for the screenshot pass.
    // The supplied transport never reaches a brokerage or listing provider.
    if (surface === "home-finder" && state !== "entry") preview.current?.querySelector("form")?.requestSubmit();
  }, [surface, state]);
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    <p role="note" className="px-6 py-3 text-xs text-gray-muted">Fictional L13 preview · listings, people, counts and delivery receipts are made up. No outside action occurs.</p>
    <div ref={preview}>{surface === "home-finder" ? <HomeFinderBuyer bindingId={workspaceId} entryToken="fictional-entry-token" brokerageName="[Brokerage]" request={fixtureRequest(state)} /> : <AgencyProspectsView signedIn={false} workspaceId={workspaceId} prospects={state === "empty" ? [] : prospects} loading={state === "loading"} error={state === "error" ? "Prospects are temporarily unavailable." : state === "permission" ? "Agency membership is required." : null} />}</div>
  </div>;
}
