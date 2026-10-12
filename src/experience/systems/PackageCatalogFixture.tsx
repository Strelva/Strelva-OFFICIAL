"use client";
import { useCallback, useRef } from "react";
import { SourcePackageControls } from "@/experience/workspace/agency/SourcePackageControls";
import { effectivePackageBehavior } from "@/platform/system-versions/declaration";
import { PackageCatalog } from "./PackageCatalog";
const workspaceId = "cb000000-0000-4000-8000-000000000011";
const source = { businessId: "cb000000-0000-4000-8000-000000000010", systemId: "cb000000-0000-4000-8000-000000000020", revisionId: "cb000000-0000-4000-8000-000000000021", number: 1 };
const listing = { name: "Staff intake", creatorName: "Northside Studio", source: { source: { businessId: source.businessId, systemId: source.systemId }, listingState: "listed", creatorWorkspaceId: source.businessId }, revision: { source, definition: { kind: "internal_app", title: "Staff intake", fields: [{ id: "request", label: "Request", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }] }, summary: "A private form for staff requests.", declaration: effectivePackageBehavior({kind:"internal_app",title:"Staff intake",fields:[{id:"request",label:"Request",type:"text",required:true}],components:[{kind:"form",fields:["request"]}]}), qualification: { revisionId: source.revisionId, status: "qualified", evidence: ["shareable_definition", "declaration_match", "rehearsal", "prior_revision_compare"].map(check => ({ revisionId: source.revisionId, check, status: "passed", note: "Fictional exact-revision preview evidence" })), humanReview: { state: "approved", reviewerId: "cb000000-0000-4000-8000-000000000003", reviewedAt: "2026-10-07T00:00:00.000Z", note: "Fictional review" } } } };
export function PackageCatalogFixture({ state }: { state: string }) {
 const attempts = useRef(0), command = useRef<string | null>(null);
 const sourceState = useRef("private"), human = useRef("pending"), granted = useRef(false);
 const request: typeof fetch = useCallback(async (_input, init) => {
  const url = String(_input);
  if (init?.method === "POST") {
   const input = JSON.parse(String(init.body)) as Record<string,unknown>;
   if(input.action === "grant_install") { granted.current=true; return Response.json({grantId:"cb000000-0000-4000-8000-000000000040",workspaceId,commandId:input.commandId,expiresAt:input.expiresAt}); }
   if(input.action === "revoke_install") { granted.current=false; return Response.json(true); }
   if(input.action === "listing") { sourceState.current=String(input.state);return Response.json({source:{businessId:source.businessId,systemId:source.systemId},listingState:input.state}); }
   if(input.action === "review") { human.current=input.approve?"approved":"rejected";return Response.json(listing.revision.qualification); }
   if(input.action === "qualify")return Response.json(listing.revision.qualification);
   const body = String(init.body); if (command.current && command.current !== body) throw new Error("The retry changed the pending installation."); command.current = body;
   if (state === "retry" && attempts.current++ === 0) throw new Error("The response was lost. Retry this same installation.");
   return Response.json({ workspaceId, systemId: "cb000000-0000-4000-8000-000000000030", versionId: "cb000000-0000-4000-8000-000000000031", rowRevision: 1, outcome: "created" });
  }
  if(url.includes("sourceSystemId")) return Response.json({workspaceId:source.businessId,systemId:source.systemId,source:{...listing.source,listingState:sourceState.current},revision:{...listing.revision,qualification:{...listing.revision.qualification,status:human.current==="approved"?"qualified":human.current==="rejected"?"rejected":"pending",humanReview:{...listing.revision.qualification.humanReview,state:human.current,note:"Fictional configured review standard"}}},canReview:true});
  if(url.includes("grantsForRevision"))return Response.json({workspaceId,grants:granted.current?[{grantId:"cb000000-0000-4000-8000-000000000040",workspaceId,commandId:"cb000000-0000-4000-8000-000000000041",agencyWorkspaceId:source.businessId,revisionId:source.revisionId,expiresAt:"2026-10-14T00:00:00Z",status:"active"}]:[]});
  if (state === "loading") return new Promise<Response>(() => {});
  if (state === "error") return Response.json({ error: "Qualified apps are temporarily unavailable." }, { status: 503 });
  return Response.json({ workspaceId, listings: state === "empty" ? [] : [listing] });
 }, [state]);
 if(state === "source")return <SourcePackageControls request={request} workspaceId={source.businessId} systemId={source.systemId} />;
 return <PackageCatalog workspaceId={workspaceId} canGrantInstall={state === "delegation"} canInstall={state !== "permission"} requestOverride={request} />;
}
