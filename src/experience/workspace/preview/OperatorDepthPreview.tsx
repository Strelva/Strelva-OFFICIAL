"use client";

import { Suspense, useState } from "react";
import { PortfolioActionsClient } from "@/app/admin/actions/PortfolioActionsClient";
import { PortfolioOpportunitiesClient } from "@/app/admin/actions/PortfolioOpportunitiesClient";
import { AuditList } from "@/app/admin/audit/AuditList";
import { SiteAuditsBoard } from "@/app/admin/audit/SiteAuditsBoard";
import { MaintenanceDigests } from "@/app/admin/digests/MaintenanceDigests";
import { DraftsView } from "@/app/admin/drafts/DraftsView";
import { LeadsView } from "@/app/admin/leads/LeadsView";
import { PolicyScreen } from "@/app/admin/needs-you/PolicyView";
import { OnboardForm } from "@/app/admin/onboard/OnboardForm";
import { OpsView } from "@/app/admin/ops/OpsView";
import { PayLinksView } from "@/app/admin/pay-links/PayLinksView";
import { InternalWorkView } from "@/app/admin/work/WorkView";
import { StEmpty, StHead, StNotice, StPage, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import { createOperatorDepthTransport, OPERATOR_DEPTH_HEALTH, OPERATOR_DEPTH_LEAD_STATUS, OPERATOR_DEPTH_PAYMENTS, OPERATOR_DEPTH_TITLES, operatorDepthActions, operatorDepthActivity, operatorDepthAudits, operatorDepthDigests, operatorDepthDrafts, operatorDepthLeads, operatorDepthOpportunities, operatorDepthOps, operatorDepthPayLinks, operatorDepthPolicy, operatorDepthProvision, operatorDepthWork, type OperatorDepthScenario, type OperatorDepthSurface } from "./operator-depth-fixture";

export function OperatorDepthPreview({ surface, scenario = "ready", result = false }: { surface: OperatorDepthSurface; scenario?: OperatorDepthScenario; result?: boolean }) {
  const empty = scenario === "empty";
  const [request] = useState(() => createOperatorDepthTransport(empty));
  const title = OPERATOR_DEPTH_TITLES[surface];
  if (scenario === "loading" || scenario === "error" || scenario === "denied") return <StPage width={surface === "audit" ? "wide" : undefined}>
    <StHead title={title} />
    {scenario === "loading" ? <StSection title="Reading records"><StSkeleton label={`Reading ${title.toLowerCase()}`} width="70%" /><StSkeleton width="90%" /><StSkeleton width="40%" /></StSection>
      : scenario === "error" ? <StNotice tone="critical">{title} could not be read. No changes were made. <StTextButton href={`?surface=${surface}&scenario=ready`}>Try again</StTextButton></StNotice>
        : <StEmpty>Operators only. Sign in with a verified Strelva operator account and the required business access.</StEmpty>}
  </StPage>;
  switch (surface) {
    case "actions": return <StPage><StHead title={title} meta="Prepare changes and review approvals across clients." />
      <PortfolioOpportunitiesClient snapshot={operatorDepthOpportunities(empty)} draftOpportunity={async (_kind, tenantIds) => ({ ok: true, results: tenantIds.map(tenantId => ({ tenantId, drafted: true })) })} />
      <PortfolioActionsClient snapshot={operatorDepthActions(empty)} resolveActions={async items => ({ ok: true, results: items.map(item => ({ ...item, changed: true })) })} escalateActions={async items => ({ ok: true, results: items.map(item => ({ eventId: item.eventId, changed: true })) })} />
    </StPage>;
    case "audit": return <StPage width="wide"><StHead title={title} meta="Check each live site’s health, search readiness and what to fix first." /><SiteAuditsBoard initialRows={operatorDepthAudits(empty)} request={request} /><StSection title="Operator activity" meta="Newest first"><AuditList events={operatorDepthActivity(empty)} /></StSection></StPage>;
    case "digests": return <StPage><StHead title={title} meta="The upkeep each site needs this week. Approve to put proposed work in the owner’s dashboard for review; dismiss to skip it." /><MaintenanceDigests initialDigests={operatorDepthDigests(empty)} request={request} /></StPage>;
    case "drafts": return <DraftsView drafts={operatorDepthDrafts(empty)} readOnly />;
    case "leads": return <LeadsView leads={operatorDepthLeads(empty)} initialWorkflow={empty ? {} : OPERATOR_DEPTH_LEAD_STATUS} readOnly />;
    case "needs-you": return <PolicyScreen load={operatorDepthPolicy(empty)} hrefFor={() => "?surface=needs-you&scenario=ready"} readOnly />;
    case "onboard": return empty ? <StPage><StHead title={title} /><StEmpty>No client record has been created in this fictional preview.</StEmpty><StTextButton href="?surface=onboard&scenario=ready">Open the onboarding form</StTextButton></StPage> : <Suspense fallback={<StPage><StHead title={title} /><StSkeleton label="Reading the onboarding form" /></StPage>}><OnboardForm request={request} preview initialResult={result ? operatorDepthProvision() : null} /></Suspense>;
    case "ops": return <OpsView report={operatorDepthOps(empty)} health={OPERATOR_DEPTH_HEALTH} readOnly />;
    case "pay-links": return <PayLinksView request={request} initialLinks={operatorDepthPayLinks(empty)} initialPayments={empty ? {} : OPERATOR_DEPTH_PAYMENTS} preview />;
    case "work": return <InternalWorkView effort={operatorDepthWork(empty)} workspaceOpen learningOpen={false} operationsHref="/workspace/operations" learningHref="/workspace/product-learning" preview />;
  }
}
