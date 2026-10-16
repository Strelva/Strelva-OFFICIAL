import Link from "next/link";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { notFound, redirect } from "next/navigation";
import { StPage, StHead, StNotice, StPillLink, StTextButton } from "@/components/ui/strelva/Kit";
import { BusinessBillingView } from "@/experience/workspace/billing/BusinessBillingView";
import { businessBillingEnabled, readAgencyBilling, readBusinessBilling } from "@/platform/business-billing";
import { AgencyInvoiceAcceptance } from "@/experience/workspace/billing/AgencyInvoiceControls";
import { AgencyBillingView } from "@/experience/workspace/billing/AgencyBillingView";
import { BusinessAiBudgetSummary, StartWorkspacePlan, WorkspacePlanUnavailable } from "@/experience/workspace/billing/StartWorkspacePlan";
import { selfServeBillingConfig } from "@/platform/business-billing/workspace-checkout";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readBusinessAgencies } from "@/platform/agency-directory";
import { commandAgencyInvoice } from "@/platform/agency-billing";
import { readCheckoutAvailability, type CheckoutAvailability } from "@/platform/connect/checkout-availability";
import { AgencyCheckoutStatus } from "@/experience/workspace/billing/AgencyCheckoutStatus";
import { AgencyPayerRequests } from "@/experience/workspace/billing/AgencyPayerRequests";
import { aiControlsReleaseEnabled } from "@/platform/infra/ai-controls-release";
import { businessAiCapUsd, readBusinessAiBudget, type AiControlsState, type BusinessAiBudget } from "@/platform/infra/business-ai-budget";
import { workspaceHttpActor } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/** Read-only billing home. No price, payment or Stripe mutation lives here. */
export default async function BusinessBillingPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; invoiceId?: string }> }) {
  if (!workspaceReleaseEnabled() || !businessBillingEnabled()) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in?next=%2Fworkspace");
  const query = await searchParams;
  const workspaceId = query.workspaceId ?? "";
  const workspaces = await listWorkspaces(actor);
  const workspace = workspaces.find(item => item.id === workspaceId);
  if (workspace?.kind === "agency") {
    let agency;
    try { agency = await readAgencyBilling(actor, workspaceId); }
    catch { return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="font-display text-3xl">Agency billing</h1><p role="alert" className="mt-6">Only an agency owner or admin can read its billing. Reload after confirming your access.</p></main>; }
    const checkoutAvailability = await readCheckoutAvailability(workspaceId);
    return <main className="mx-auto max-w-3xl px-6 py-12 text-warm-black"><Link className="inline-flex min-h-12 items-center underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the agency</Link>{process.env.STRELVA_CONNECT === "1" ? <Link className="ml-4 inline-flex min-h-12 items-center underline" href={`/workspace/payments?workspaceId=${encodeURIComponent(workspaceId)}`}>Agency payments</Link> : null}{process.env.STRELVA_PROVIDER_CHANGE === "1" ? <Link className="ml-4 inline-flex min-h-12 items-center underline" href={`/workspace/provider-change?workspaceId=${encodeURIComponent(workspaceId)}`}>Agency handoffs</Link> : null}{process.env.STRELVA_REVENUE_SPLITS === "1" ? <Link className="mt-4 inline-flex min-h-12 items-center underline" href={`/workspace/creator-maintenance?workspaceId=${encodeURIComponent(workspaceId)}`}>Creator maintenance</Link> : null}<Link className="ml-4 inline-flex min-h-12 items-center underline" href={`/workspace/payment-links?workspaceId=${encodeURIComponent(workspaceId)}`}>Payment links</Link>{agency ? <AgencyBillingView billing={agency} checkoutAvailability={checkoutAvailability} /> : <><StHead title="Agency billing" /><p className="mt-8">Agency billing is not recorded yet.</p><AgencyCheckoutStatus availability={checkoutAvailability} paymentsHref={`/workspace/payments?workspaceId=${encodeURIComponent(workspaceId)}`} /></>}<AgencyPayerRequests agencyWorkspaceId={workspaceId} /></main>;
  }
  let billing;
  try { billing = await readBusinessBilling(actor, workspaceId); }
  catch { return <StrelvaShell title="" workspaceId={workspaceId} active="settings" detailsPlace="plan" systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}><StPage><StHead title="Plan and billing" /><StNotice tone="critical">Billing could not be loaded. Confirm your access and try again.</StNotice><StPillLink variant="soft" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the business</StPillLink></StPage></StrelvaShell>; }
  // The service-role budget read needs an authorized customer member first.
  const customerMember = workspace?.kind === "customer" && workspace.access === "member";
  const canManage = customerMember && workspace.role === "owner";
  let budget: (BusinessAiBudget & { controls?: AiControlsState }) | null = null;
  let capUsd: number | null = null;
  if (customerMember) {
    try {
      budget = await readBusinessAiBudget(workspaceId);
      if (budget) capUsd = businessAiCapUsd(budget);
    } catch { budget = null; capUsd = null; }
  }
  const budgetEnforced = process.env.STRELVA_BUSINESS_AI_BUDGET === "1";
  // Business budget v2 is also read for the list-price ceiling alone; its controls show only with their own release.
  const controlsOn = aiControlsReleaseEnabled();
  const needsPlan = (!billing || billing.state === "none") && canManage && budget !== null && !budget.subscribed;
  const showStartPlan = needsPlan && selfServeBillingConfig().enabled;
  let agencyChoices: { id: string; name: string }[] = [];
  let agencyChoicesError = "";
  if (workspace?.role === "owner") {
    try {
      const servingAgencies = await readBusinessAgencies(actor, workspaceId);
      agencyChoices = servingAgencies.filter(item => item.seat || item.ofRecord || item.scopes.some(scope => scope.status === "active"))
        .map(item => ({ id: item.agencyWorkspaceId, name: item.name }));
    } catch { agencyChoicesError = "Serving agencies could not be loaded. Reload before proposing an agency payer."; }
  }
  let invoiceCheckoutAvailability: CheckoutAvailability = { status: "coming_soon" };
  if (query.invoiceId && process.env.STRELVA_CONNECT === "1") {
    try {
      // Authorize the exact invoice before reading its agency's merchant state.
      const invoice = await commandAgencyInvoice(actor, { action: "read", intentId: query.invoiceId });
      invoiceCheckoutAvailability = invoice.business_workspace_id === workspaceId ? await readCheckoutAvailability(invoice.agency_workspace_id) : { status: "unavailable" };
    } catch { invoiceCheckoutAvailability = { status: "unavailable" }; }
  }
  return <StrelvaShell title="" workspaceId={workspaceId} businessContext={workspace?.name} active="settings" detailsPlace="plan" systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}><StPage>
    <BusinessBillingView workspaceId={workspaceId} canManage={canManage} billing={billing} businessName={workspace?.name} backHref={`/workspace/business-details?workspaceId=${encodeURIComponent(workspaceId)}`} />
    {showStartPlan ? <StartWorkspacePlan workspaceId={workspaceId} budget={budget} capUsd={capUsd} budgetEnforced={budgetEnforced} controls={controlsOn ? budget?.controls ?? null : null} /> : customerMember ? <BusinessAiBudgetSummary budget={budget} capUsd={capUsd} enforced={budgetEnforced} controls={controlsOn ? budget?.controls ?? null : null} /> : null}
    {needsPlan && !showStartPlan ? <WorkspacePlanUnavailable workspaceId={workspaceId} /> : null}
    <nav aria-label="Payment and agency settings" className="flex flex-wrap gap-4">
      {process.env.STRELVA_REVENUE_SPLITS === "1" ? <><StTextButton href={`/workspace/creator-maintenance?workspaceId=${encodeURIComponent(workspaceId)}`}>Creator maintenance</StTextButton><StTextButton href={`/workspace/money-terms?workspaceId=${encodeURIComponent(workspaceId)}`}>Recorded money terms</StTextButton></> : null}
      {process.env.STRELVA_CONNECT === "1" ? <StTextButton href={`/workspace/payments?workspaceId=${encodeURIComponent(workspaceId)}`}>Payments and merchant account</StTextButton> : null}
      {process.env.STRELVA_PROVIDER_CHANGE === "1" ? <StTextButton href={`/workspace/provider-change?workspaceId=${encodeURIComponent(workspaceId)}`}>Agency handoff</StTextButton> : null}
    </nav>
    {query.invoiceId ? <AgencyInvoiceAcceptance invoiceId={query.invoiceId} checkoutAvailability={invoiceCheckoutAvailability} /> : null}
    <WorkspacePayerTransition key={workspaceId} workspaceId={workspaceId} canPropose={workspace?.role === "owner"} agencyChoices={agencyChoices} agencyChoicesError={agencyChoicesError} providerChangeEnabled={process.env.STRELVA_PROVIDER_CHANGE === "1"} />
  </StPage></StrelvaShell>;
}
