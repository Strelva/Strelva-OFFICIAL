"use client";

import { XaPebbleAvatar, XaPebbleScene } from "@/components/ui/strelva/Xa";
import type { AgencyBilling } from "@/platform/business-billing";
import { useAgencyPayerRequests } from "./AgencyPayerRequests";
import styles from "@/experience/workspace/money/money.module.css";

const amount = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency })
    .format(cents / 100)
    .replace(/\.00$/, "");
const names = (list: readonly string[]) =>
  list.length <= 2
    ? list.join(" and ")
    : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;

/**
 * Pebble's job on agency billing (XA · AG6 right column): keep count of the
 * answers owners still owe the agency, so nothing is charged by mistake. It
 * reads the same records as the list beside it and invents nothing.
 */
export function AgencyBillingPebble({ billing }: { billing: AgencyBilling }) {
  const payer = useAgencyPayerRequests();
  const latest = billing.clients
    .filter((client) => client.lineState === "active")
    .map((client) => ({ client, invoice: client.invoices?.[0] }))
    .filter((item) => item.invoice);
  const waiting = latest.filter((item) => item.invoice!.status === "proposed");
  const agreed = latest.filter((item) =>
    ["accepted", "awaiting_payment", "active", "paid"].includes(
      item.invoice!.status,
    ),
  );
  const asks = payer?.requests ?? [];
  const lines: { count: number; text: string }[] = [];
  for (const { client, invoice } of waiting)
    lines.push({
      count: 1,
      text: `${client.name}'s owner hasn't answered your ${amount(invoice!.amount_cents, invoice!.currency)}${invoice!.kind === "rebill" ? " a month" : ""} price`,
    });
  if (asks.length)
    lines.push({
      count: asks.length,
      text: `${names(asks.map((item) => item.workspaceName ?? "a business"))} ${asks.length === 1 ? "asks" : "ask"} ${billing.name} to cover Strelva`,
    });
  if (agreed.length)
    lines.push({
      count: agreed.length,
      text: `${names(agreed.map(({ client }) => client.name))} agreed to your price`,
    });
  const open = waiting.length + asks.length;
  return (
    <section
      className={styles.pebbleAside}
      aria-label="What Pebble is waiting on"
    >
      <div className={styles.pebbleArt}>
        <XaPebbleScene pose={open ? "waving" : "resting"} size={220} />
      </div>
      <p className={styles.pebbleLead}>
        <span className={styles.pebblePhoneAvatar}>
          <XaPebbleAvatar size={28} />
        </span>
        {open
          ? `Pebble is keeping count: ${open === 1 ? "1 answer" : `${open} answers`} still to come.`
          : "Pebble is keeping count. Nothing waits on an owner."}
      </p>
      {lines.length ? (
        <ul className={styles.pebbleList}>
          {lines.map((line) => (
            <li key={line.text}>{line.text}.</li>
          ))}
        </ul>
      ) : null}
      <p className={styles.note}>
        A client is charged only after its owner says yes to the exact price.
      </p>
    </section>
  );
}
