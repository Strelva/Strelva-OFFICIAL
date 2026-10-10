import Link from "next/link";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { notFound, redirect } from "next/navigation";
import { StPage, StHead, StNotice, StPillLink, StTextButton } from "@/components/ui/strelva/Kit";
import { BusinessBillingView } from "@/experience/workspace/billing/BusinessBillingView";
import { businessBillingEnabled, readAgencyBilling, readBusinessBilling } from "@/platform/business-billing";
import { AgencyInvoiceAcceptance } from "@/experience/workspace/billing/AgencyInvoiceControls";
import { AgencyBillingView } from "@/experience/workspace/billing/AgencyBillingView";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
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
    return <main className="mx-auto max-w-3xl px-6 py-12 text-warm-black"><Link className="inline-flex min-h-12 items-center underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the agency</Link>{process.env.STRELVA_CONNECT === "1" ? <Link className="ml-4 inline-flex min-h-12 items-center underline" href={`/workspace/payments?workspaceId=${encodeURIComponent(workspaceId)}`}>Agency payments</Link> : null}{process.env.STRELVA_PROVIDER_CHANGE === "1" ? <Link className="ml-4 inline-flex min-h-12 items-center underline" href={`/workspace/provider-change?workspaceId=${encodeURIComponent(workspaceId)}`}>Provider handoffs</Link> : null}{process.env.STRELVA_REVENUE_SPLITS === "1" ? <Link className="mt-4 inline-flex min-h-12 items-center underline" href={`/workspace/creator-maintenance?workspaceId=${encodeURIComponent(workspaceId)}`}>Creator maintenance</Link> : null}{agency ? <AgencyBillingView billing={agency} /> : <p className="mt-8">Agency billing is not recorded yet.</p>}</main>;
  }
  let billing;
  try { billing = await readBusinessBilling(actor, workspaceId); }
  catch { return <StrelvaShell title="" workspaceId={workspaceId} active="settings" systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}><StPage><StHead title="Plan and billing" /><StNotice tone="critical">Billing could not be loaded. Confirm your access and try again.</StNotice><StPillLink variant="soft" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the business</StPillLink></StPage></StrelvaShell>; }
  return <StrelvaShell title="" workspaceId={workspaceId} businessContext={workspace?.name} active="settings" systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}><StPage>
    <BusinessBillingView billing={billing} businessName={workspace?.name} backHref={`/workspace/business-details?workspaceId=${encodeURIComponent(workspaceId)}`} />
    <nav aria-label="Payment and provider settings" className="flex flex-wrap gap-4">
      {process.env.STRELVA_REVENUE_SPLITS === "1" ? <><StTextButton href={`/workspace/creator-maintenance?workspaceId=${encodeURIComponent(workspaceId)}`}>Creator maintenance</StTextButton><StTextButton href={`/workspace/money-terms?workspaceId=${encodeURIComponent(workspaceId)}`}>Recorded money terms</StTextButton></> : null}
      {process.env.STRELVA_CONNECT === "1" ? <StTextButton href={`/workspace/payments?workspaceId=${encodeURIComponent(workspaceId)}`}>Payments and merchant account</StTextButton> : null}
      {process.env.STRELVA_PROVIDER_CHANGE === "1" ? <StTextButton href={`/workspace/provider-change?workspaceId=${encodeURIComponent(workspaceId)}`}>Provider handoff</StTextButton> : null}
    </nav>
    {query.invoiceId ? <AgencyInvoiceAcceptance invoiceId={query.invoiceId} /> : null}
    <WorkspacePayerTransition key={workspaceId} workspaceId={workspaceId} canPropose={workspace?.role === "owner"} agencyChoices={workspaces.filter(item => item.kind === "agency").map(item => ({ id: item.id, name: item.name })).concat(billing?.payerParty?.kind === "agency" && billing.payerParty.workspaceId && !workspaces.some(item => item.id === billing.payerParty?.workspaceId) ? [{ id: billing.payerParty.workspaceId, name: billing.payerParty.name ?? "Current payer agency" }] : [])} providerChangeEnabled={process.env.STRELVA_PROVIDER_CHANGE === "1"} />
  </StPage></StrelvaShell>;
}
