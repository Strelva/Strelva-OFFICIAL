import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { businessBillingEnabled, readBusinessBilling } from "@/platform/business-billing";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/** Read-only billing home. No price, payment or Stripe mutation lives here. */
export default async function BusinessBillingPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled() || !businessBillingEnabled()) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in?next=%2Fworkspace");
  const workspaceId = (await searchParams).workspaceId ?? "";
  let billing;
  try { billing = await readBusinessBilling(actor, workspaceId); }
  catch { return <main className="mx-auto max-w-3xl px-6 py-12"><h1 className="font-display text-3xl">Business billing</h1><p role="alert" className="mt-6 text-gray-muted">Billing could not be loaded. Confirm your access and try again.</p><Link className="mt-6 inline-flex min-h-12 items-center underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the business</Link></main>; }
  return <main className="mx-auto max-w-3xl px-6 py-12 text-warm-black">
    <Link className="inline-flex min-h-12 items-center text-gray-muted underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to the business</Link>
    <h1 className="mt-6 font-display text-3xl font-medium">Business billing</h1>
    {billing ? <Card className="mt-8" padding="lg">
      <p className="text-lg font-medium">{billing.state === "grandfathered" ? "Your existing terms are kept" : billing.state === "comped" ? "Comped" : billing.state === "none" ? "Billing needs to be recorded" : billing.state === "custom" ? "Custom agreement" : "Subscription"}</p>
      <p className="mt-3 text-2xl font-medium tabular-nums">${(billing.monthlyCents / 100).toFixed(2)} / month</p>
      <p className="mt-3 text-sm text-gray-muted">Payment: {billing.paymentStatus.replaceAll("_", " ")}{billing.paidThrough ? ` · Paid through ${billing.paidThrough.slice(0, 10)}` : ""}</p>
      {billing.paymentStatus === "past_due" ? <p role="status" className="mt-6">Your payment needs attention. Your sites and inquiry capture keep working.</p> : null}
      {billing.grandfatheredTerms ? <p className="mt-6 text-sm text-gray-muted">{billing.grandfatheredTerms}</p> : null}
      <h2 className="mt-8 font-medium">Sites covered</h2>
      <ul className="mt-3 space-y-3 text-sm">{billing.sites.map(site => <li key={site.tenantId}>{site.siteName} · ${(site.amountCents / 100).toFixed(2)} / month</li>)}</ul>
      <p className="mt-6 text-sm text-gray-muted">Moving into the business workspace does not change your amount, plan, card or payment cycle. Payment changes use your existing billing settings.</p>
      <Link className="mt-6 inline-flex min-h-12 items-center underline" href="/dashboard/settings#plan">Open billing settings</Link>
    </Card> : <p className="mt-8 text-gray-muted">No billing record is attached to this business yet. Strelva needs to record the existing agreement.</p>}
  </main>;
}
