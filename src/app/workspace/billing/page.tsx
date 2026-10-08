import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
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
  const workspace = (await listWorkspaces(actor)).find(item => item.id === workspaceId);
  if (workspace?.kind === "agency") {
    let agency;
    try { agency = await readAgencyBilling(actor, workspaceId); }
    catch { return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="font-display text-3xl">Agency billing</h1><p role="alert" className="mt-6">Only an agency owner or admin can read its billing. Reload after confirming your access.</p></main>; }
    return <main className="mx-auto max-w-3xl px-6 py-12 text-warm-black"><Link className="inline-flex min-h-12 items-center underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the agency</Link>{agency ? <AgencyBillingView billing={agency} /> : <p className="mt-8">Agency billing is not recorded yet.</p>}</main>;
  }
  let billing;
  try { billing = await readBusinessBilling(actor, workspaceId); }
  catch { return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="font-display text-3xl">Business billing</h1><p role="alert" className="mt-6 text-gray-muted">Billing could not be loaded. Confirm your access and try again.</p><Link className="mt-6 inline-flex min-h-12 items-center underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the business</Link></main>; }
  return <main className="mx-auto max-w-3xl px-6 py-12 text-warm-black">
    <Link className="inline-flex min-h-12 items-center text-gray-muted underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the business</Link>
    <h1 className="mt-6 font-display text-3xl font-medium">Business billing</h1>
    {billing ? <Card className="mt-8" padding="lg">
      <p className="text-lg font-medium">{billing.state === "grandfathered" ? "Your existing terms are kept" : billing.state === "comped" ? "Comped" : billing.state === "none" ? "Billing needs to be recorded" : billing.state === "custom" ? "Custom agreement" : "Subscription"}</p>
      <p className="mt-3 text-sm">Payer: {billing.payerParty?.kind === "agency" ? billing.payerParty.name ?? "Your agency" : "This business"}</p>
      <p className="mt-3 text-2xl font-medium tabular-nums">${(billing.monthlyCents / 100).toFixed(2)} / month</p>
      <p className="mt-3 text-sm text-gray-muted">Payment: {billing.paymentStatus.replaceAll("_", " ")}{billing.paidThrough ? ` · Paid through ${billing.paidThrough.slice(0, 10)}` : ""}</p>
      {billing.paymentStatus === "past_due" ? <p role="status" className="mt-6">{billing.payerParty?.kind === "agency" ? "Your agency’s payment needs attention. A business owner can choose direct payment for future work below." : "Your payment needs attention."} Your sites and inquiry capture keep working.</p> : null}
      {billing.grandfatheredTerms ? <p className="mt-6 text-sm text-gray-muted">{billing.grandfatheredTerms}</p> : null}
      <h2 className="mt-8 font-medium">Sites covered</h2>
      <ul className="mt-3 space-y-3 text-sm">{billing.sites.map(site => <li key={site.tenantId}>{site.siteName} · ${(site.amountCents / 100).toFixed(2)} / month</li>)}</ul>
      <p className="mt-6 text-sm text-gray-muted">Moving into the business workspace does not change your amount, plan, card or payment cycle. Payment changes use your existing billing settings.</p>
      <Link className="mt-6 inline-flex min-h-12 items-center underline" href="/dashboard/settings#plan">Open billing settings</Link>
      {billing.payerParty?.kind === "agency" ? <p className="mt-4 text-sm text-gray-muted">This amount records the existing business agreement. Agency wholesale pricing and any separate retail invoice are shown in the agency’s billing records.</p> : null}
    </Card> : <p className="mt-8 text-gray-muted">No billing record is attached to this business yet. The existing agreement and chosen payer need to be recorded.</p>}
    {query.invoiceId ? <AgencyInvoiceAcceptance invoiceId={query.invoiceId} /> : null}
    <WorkspacePayerTransition workspaceId={workspaceId} canPropose={workspace?.role === "owner"} providerChangeEnabled={process.env.STRELVA_PROVIDER_CHANGE === "1"} />
  </main>;
}
