import { AgencyInvoiceControls } from "./AgencyInvoiceControls";
import type { CheckoutAvailability } from "@/platform/connect/checkout-availability";
import { AgencyCheckoutStatus, UNRELEASED_CHECKOUT } from "./AgencyCheckoutStatus";
import type { AgencyBilling } from "@/platform/business-billing";
import { XaHeadline, XaInitial, XaLabel, XaSays, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

const monthly = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Agency billing (XA · AG6): one line per client the agency pays for, its number on the right, the retail price inline. */
export function AgencyBillingView({ billing, checkoutAvailability = UNRELEASED_CHECKOUT }: { billing: AgencyBilling; checkoutAvailability?: CheckoutAvailability }) {
  const active = billing.clients.filter(client => client.lineState === "active");
  const priced = active.filter(client => client.monthlyCents !== null);
  const total = priced.reduce((sum, client) => sum + (client.monthlyCents ?? 0), 0);
  return <section className={styles.section} aria-labelledby="agency-billing-heading">
    <div className={styles.brief}>
      <XaHeadline id="agency-billing-heading" quiet={priced.length === active.length && active.length ? `${monthly(total)} a month to Strelva.` : "Wholesale amounts are not priced yet."}>
        {billing.name} pays for {active.length === 1 ? "1 client" : `${active.length} clients`}.
      </XaHeadline>
      <p className={styles.note}>What each client pays you is a separate retail price, set on its line and agreed by its owner.</p>
    </div>
    {billing.paymentStatus === "past_due" ? <XaSays>Your agency&apos;s payment to Strelva needs attention. Client sites stay online, and each owner can choose to pay directly for future work.</XaSays> : null}
    <AgencyCheckoutStatus availability={checkoutAvailability} paymentsHref={`/workspace/payments?workspaceId=${encodeURIComponent(billing.workspaceId)}`} />
    <div className={styles.section}>
      <XaLabel as="h2">Clients you pay for</XaLabel>
      {billing.clients.length ? <ul className={styles.clientList} aria-label="Clients you pay for">{billing.clients.map(client => <li key={client.workspaceId} className={styles.clientLine}>
        <XaInitial name={client.name} size={32} />
        <div className={styles.clientText}>
          <XaTextLink href={`/workspace/billing?workspaceId=${encodeURIComponent(client.workspaceId)}`}>{client.name}</XaTextLink>
          <span className={styles.note}>{client.lineState === "ended" ? "The owner changed the payer; this line ended" : client.paymentStatus === "past_due" ? <XaStatus kind="waits" size="sm">Payment needs attention</XaStatus> : "Your agency pays"}</span>
          {client.lineState === "active" ? <AgencyInvoiceControls agencyWorkspaceId={billing.workspaceId} businessWorkspaceId={client.workspaceId} initialInvoices={client.invoices} checkoutAvailability={checkoutAvailability} /> : null}
        </div>
        <p className={styles.clientFigure}>{client.monthlyCents === null ? <span className={styles.figureQuiet}>Wholesale price not set</span> : <>{monthly(client.monthlyCents)}<span className={styles.figureQuiet}> / month</span></>}</p>
      </li>)}</ul> : <p className={styles.body}>No business has accepted your agency as payer yet. Requests from owners appear beside this list.</p>}
    </div>
  </section>;
}
