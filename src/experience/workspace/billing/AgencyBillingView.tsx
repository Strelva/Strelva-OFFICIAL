import { AgencyInvoiceControls } from "./AgencyInvoiceControls";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { AgencyBilling } from "@/platform/business-billing";

export function AgencyBillingView({ billing }: { billing: AgencyBilling }) {
  return <section aria-labelledby="agency-billing-heading">
    <h1 id="agency-billing-heading" className="mt-6 font-display text-3xl font-medium">Agency billing</h1>
    <p className="mt-3 text-sm text-gray-muted">{billing.name} pays for the active clients below. Wholesale amounts remain unpriced until the platform terms are selected. Client retail agreements are separate.</p>
    {billing.paymentStatus === "past_due" ? <p role="status" className="mt-6 text-critical">Agency payment needs attention. Client sites remain online. Each business owner can choose direct payment for future work.</p> : null}
    <Card className="mt-8" padding="lg">
      <h2 className="font-medium">Client lines</h2>
      {billing.clients.length ? <ul className="mt-4 divide-y divide-gray-border">{billing.clients.map(client => <li key={client.workspaceId} className="flex flex-wrap items-start justify-between gap-4 py-4">
        <div><Link className="font-medium underline" href={`/workspace/billing?workspaceId=${encodeURIComponent(client.workspaceId)}`}>{client.name}</Link><p className="mt-2 text-sm text-gray-muted">{client.state.replaceAll("_", " ")} · {client.paymentStatus.replaceAll("_", " ")} · {client.lineState === "ended" ? "Payer changed; line ended" : "Agency pays"}</p>{client.lineState === "active" ? <AgencyInvoiceControls agencyWorkspaceId={billing.workspaceId} businessWorkspaceId={client.workspaceId} initialInvoices={client.invoices} /> : null}</div>
        <p className="text-sm tabular-nums">{client.monthlyCents === null ? "Wholesale price not set" : `$${(client.monthlyCents / 100).toFixed(2)} / month`}</p>
      </li>)}</ul> : <p className="mt-4 text-sm text-gray-muted">No business has accepted this agency as payer yet.</p>}
    </Card>
  </section>;
}
