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
      text: `${client.name}'s ${amount(invoice!.amount_cents, invoice!.currency)}${invoice!.kind === "rebill" ? " a month" : ""} retail price waits on its owner`,
    });
  if (asks.length)
    lines.push({
      count: asks.length,
      text: `${asks.length === 1 ? "owner asked" : "owners asked"} ${billing.name} to pay: ${names(asks.map((item) => item.workspaceName ?? "a business"))}`,
    });
  if (agreed.length)
    lines.push({
      count: agreed.length,
      text: `${agreed.length === 1 ? "retail price" : "retail prices"} agreed: ${names(agreed.map(({ client }) => client.name))}`,
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
          ? `Pebble is waiting on ${open === 1 ? "1 answer" : `${open} answers`} from owners.`
          : "Pebble has nothing waiting on an owner."}
      </p>
      {lines.length ? (
        <ul className={styles.pebbleList}>
          {lines.map((line) => (
            <li key={line.text}>
              <b>{line.count}</b>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className={styles.note}>
        Nothing is charged to a client until its owner says yes to the exact
        price.
      </p>
    </section>
  );
}
