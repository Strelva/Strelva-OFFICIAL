import { AgencyInvoiceControls } from "./AgencyInvoiceControls";
import type { CheckoutAvailability } from "@/platform/connect/checkout-availability";
import {
  AgencyCheckoutStatus,
  UNRELEASED_CHECKOUT,
} from "./AgencyCheckoutStatus";
import {
  AgencyPayerRequestAsk,
  AgencyPayerRequestLines,
  AgencyPayerRequestsStatus,
} from "./AgencyPayerRequests";
import type { AgencyBilling } from "@/platform/business-billing";
import { clientColor } from "@/platform/presentation/client-color";
import {
  XaHeadline,
  XaInitial,
  XaSays,
  XaStatus,
  XaTextLink,
} from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

/**
 * Agency billing (XA · AG6): one line per client, in the client's own color.
 * The line says only what is particular to that client; what is true of every
 * line (nothing priced yet, who pays) is said once in the headline. An owner's
 * request to have the agency pay sits on that client's line, with its answers.
 * Requests from businesses not on the list yet are extra lines in the same
 * list. Rendered inside AgencyPayerRequests so the requests are known.
 */
export function AgencyBillingView({
  billing,
  checkoutAvailability = UNRELEASED_CHECKOUT,
  clientColors = {},
}: {
  billing: AgencyBilling;
  checkoutAvailability?: CheckoutAvailability;
  /** The rail's colors, by client workspace id. Missing ids fall back to clientColor(). */
  clientColors?: Readonly<Record<string, string>>;
}) {
  const active = billing.clients.filter(
    (client) => client.lineState === "active",
  );
  const color = (id: string) => clientColors[id] ?? clientColor(id);
  return (
    <section
      className={styles.section}
      aria-labelledby="agency-billing-heading"
    >
      <div className={styles.brief}>
        <XaHeadline
          id="agency-billing-heading"
          quiet="Strelva hasn't set what that costs yet, so nothing is charged."
        >
          {billing.name} covers Strelva for{" "}
          {active.length === 1 ? "1 client" : `${active.length} clients`}.
        </XaHeadline>
        <p className={styles.note}>
          What each client pays you sits on its line, and its owner agrees to it
          first.
        </p>
        <AgencyCheckoutStatus
          availability={checkoutAvailability}
          paymentsHref={`/workspace/payments?workspaceId=${encodeURIComponent(billing.workspaceId)}`}
        />
      </div>
      {billing.paymentStatus === "past_due" ? (
        <XaSays>
          Stripe couldn&apos;t take {billing.name}&apos;s last payment to
          Strelva. Client sites stay online, and each owner can choose to pay
          for themselves from now on.
        </XaSays>
      ) : null}
      <AgencyPayerRequestsStatus />
      <ul className={styles.clientList} aria-label="Clients and owner requests">
        {billing.clients.map((client) => {
          const ended = client.lineState === "ended";
          const pastDue = client.paymentStatus === "past_due";
          return (
            <li key={client.workspaceId} className={styles.clientLine}>
              <XaInitial
                name={client.name}
                color={color(client.workspaceId)}
                size={32}
              />
              <div className={styles.clientText}>
                <XaTextLink
                  href={`/workspace/billing?workspaceId=${encodeURIComponent(client.workspaceId)}`}
                >
                  {client.name}
                </XaTextLink>
                {ended ? (
                  <span className={styles.clientDetail}>
                    Its owner pays for it now, not {billing.name}.
                  </span>
                ) : pastDue ? (
                  <XaStatus kind="waits" size="sm">
                    Last payment didn&apos;t go through
                  </XaStatus>
                ) : null}
                <AgencyPayerRequestAsk workspaceId={client.workspaceId} />
              </div>
              {!ended ? (
                <AgencyInvoiceControls
                  agencyWorkspaceId={billing.workspaceId}
                  businessWorkspaceId={client.workspaceId}
                  initialInvoices={client.invoices}
                  checkoutAvailability={checkoutAvailability}
                />
              ) : null}
            </li>
          );
        })}
        <AgencyPayerRequestLines
          listed={billing.clients.map((client) => client.workspaceId)}
          colors={clientColors}
        />
      </ul>
      {!billing.clients.length ? (
        <p className={styles.body}>
          No client has {billing.name} paying for it yet.
        </p>
      ) : null}
    </section>
  );
}
