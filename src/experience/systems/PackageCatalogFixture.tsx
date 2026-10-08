"use client";
import { useCallback, useRef } from "react";
import { PackageCatalog } from "./PackageCatalog";
const workspaceId = "cb000000-0000-4000-8000-000000000011";
const source = { businessId: "cb000000-0000-4000-8000-000000000010", systemId: "cb000000-0000-4000-8000-000000000020", revisionId: "cb000000-0000-4000-8000-000000000021", number: 1 };
const listing = { name: "Staff intake", creatorName: "Northside Studio", source: { source: { businessId: source.businessId, systemId: source.systemId }, listingState: "listed", creatorWorkspaceId: source.businessId }, revision: { source, definition: { kind: "internal_app", title: "Staff intake", fields: [{ id: "request", label: "Request", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }] }, summary: "A private form for staff requests.", declaration: { recordsRead: ["application.records"], recordsWritten: ["application.records"], businessRecordFields: [], outsideEffects: [], bindingKinds: [], dataLeavingBusiness: [] }, qualification: { revisionId: source.revisionId, status: "qualified", evidence: ["shareable_definition", "declaration_match", "rehearsal", "prior_revision_compare"].map(check => ({ revisionId: source.revisionId, check, status: "passed", note: "Fictional exact-revision preview evidence" })), humanReview: { state: "approved", reviewerId: "cb000000-0000-4000-8000-000000000003", reviewedAt: "2026-10-07T00:00:00.000Z", note: "Fictional review" } } } };
export function PackageCatalogFixture({ state }: { state: string }) {
 const attempts = useRef(0), command = useRef<string | null>(null);
 const request: typeof fetch = useCallback(async (_input, init) => {
  if (init?.method === "POST") {
   const body = String(init.body); if (command.current && command.current !== body) throw new Error("The retry changed the pending installation."); command.current = body;
   if (state === "retry" && attempts.current++ === 0) throw new Error("The response was lost. Retry this same installation.");
   return Response.json({ workspaceId, systemId: "cb000000-0000-4000-8000-000000000030", versionId: "cb000000-0000-4000-8000-000000000031", rowRevision: 1, outcome: "created" });
  }
  if (state === "loading") return new Promise<Response>(() => {});
  if (state === "error") return Response.json({ error: "Qualified apps are temporarily unavailable." }, { status: 503 });
  return Response.json({ workspaceId, listings: state === "empty" ? [] : [listing] });
 }, [state]);
 return <PackageCatalog workspaceId={workspaceId} canInstall={state !== "permission"} requestOverride={request} />;
}
