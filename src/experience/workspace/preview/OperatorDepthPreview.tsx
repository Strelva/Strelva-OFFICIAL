"use client";

import { useState } from "react";
import { AuditList } from "@/app/admin/audit/AuditList";
import { SiteAuditsBoard } from "@/app/admin/audit/SiteAuditsBoard";
import { MaintenanceDigests } from "@/app/admin/digests/MaintenanceDigests";
import { DraftsView } from "@/app/admin/drafts/DraftsView";
import { LeadsView } from "@/app/admin/leads/LeadsView";
import { PolicyScreen } from "@/app/admin/needs-you/PolicyView";
import { OpsView } from "@/app/admin/ops/OpsView";
import { PayLinksView } from "@/app/admin/pay-links/PayLinksView";
import { InternalWorkView } from "@/app/admin/work/WorkView";
import { StEmpty, StHead, StNotice, StPage, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import { createOperatorDepthTransport, OPERATOR_DEPTH_HEALTH, OPERATOR_DEPTH_LEAD_STATUS, OPERATOR_DEPTH_PAYMENTS, OPERATOR_DEPTH_TITLES, operatorDepthActivity, operatorDepthAudits, operatorDepthDigests, operatorDepthDrafts, operatorDepthLeads, operatorDepthOps, operatorDepthPayLinks, operatorDepthPolicy, operatorDepthWork, type OperatorDepthScenario, type OperatorDepthSurface } from "./operator-depth-fixture";

export function OperatorDepthPreview({ surface, scenario = "ready" }: { surface: OperatorDepthSurface; scenario?: OperatorDepthScenario; result?: boolean }) {
  const empty = scenario === "empty";
  const [request] = useState(() => createOperatorDepthTransport(empty));
  const title = OPERATOR_DEPTH_TITLES[surface];
  if (scenario === "loading" || scenario === "error" || scenario === "denied") return <StPage width={surface === "audit" ? "wide" : undefined}>
    <StHead title={title} />
    {scenario === "loading" ? <StSection title="Reading records"><StSkeleton label={`Reading ${title.toLowerCase()}`} width="70%" /><StSkeleton width="90%" /><StSkeleton width="40%" /></StSection>
      : scenario === "error" ? <StNotice tone="critical">{title} could not be read. No changes were made. <StTextButton href={`?surface=${surface}&scenario=ready`}>Try again</StTextButton></StNotice>
        : <StEmpty>Operators only. Sign in with a verified Strelva operator account and the required business access.</StEmpty>}
  </StPage>;
  if (surface === "actions" || surface === "onboard") return <StPage>
    <StHead title={title} meta="Strelva Agency · Runs on Strelva" />
    <StNotice>Client service belongs to Strelva Agency. Open its workspace through your ordinary agency seat. Each request names who asked; owner decisions remain with the client business.</StNotice>
    <StNotice tone="need">This fictional preview verifies no Strelva Agency membership. Operator access grants no agency seat.</StNotice>
    <StTextButton href="/workspace">Open workspace to check agency access</StTextButton>
  </StPage>;
  switch (surface) {
    case "audit": return <StPage width="wide"><StHead title={title} meta="Check each live site’s health, search readiness and what to fix first." /><SiteAuditsBoard initialRows={operatorDepthAudits(empty)} request={request} /><StSection title="Operator activity" meta="Newest first"><AuditList events={operatorDepthActivity(empty)} /></StSection></StPage>;
    case "digests": return <StPage><StHead title={title} meta="The upkeep each site needs this week. Approve to put proposed work in the owner’s workspace for review; dismiss to skip it." /><StNotice>Retained legacy rehearsal. These local upkeep controls do not grant agency authority or approve an owner decision. Real client service uses the ordinary Strelva Agency workspace.</StNotice><MaintenanceDigests initialDigests={operatorDepthDigests(empty)} request={request} /></StPage>;
    case "drafts": return <DraftsView drafts={operatorDepthDrafts(empty)} readOnly />;
    case "leads": return <LeadsView leads={operatorDepthLeads(empty)} initialWorkflow={empty ? {} : OPERATOR_DEPTH_LEAD_STATUS} readOnly />;
    case "needs-you": return <PolicyScreen load={operatorDepthPolicy(empty)} hrefFor={() => "?surface=needs-you&scenario=ready"} readOnly />;
    case "ops": return <OpsView report={operatorDepthOps(empty)} health={OPERATOR_DEPTH_HEALTH} readOnly />;
    case "pay-links": return <PayLinksView request={request} initialLinks={operatorDepthPayLinks(empty)} initialPayments={empty ? {} : OPERATOR_DEPTH_PAYMENTS} preview />;
    case "work": return <InternalWorkView effort={operatorDepthWork(empty)} workspaceOpen learningOpen={false} operationsHref="/workspace/operations" learningHref="/workspace/product-learning" preview />;
  }
}
