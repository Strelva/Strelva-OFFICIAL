"use client";

import { Eye } from "lucide-react";
import { StEmpty, StHead, StMono, StNotice, StPage, StRow, StRows, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./store-connection.module.css";

export interface StoreOrderRead {
  id: string;
  number: string;
  description: string;
  amount: string;
  status: string;
  at: string;
  dateTime?: string;
}

/** An orders reader supplies this view. There are deliberately no order,
 * refund, stock or price commands on a read-only Store Connection. */
export function StoreConnection({ provider, freshness, orders, total, status = "unknown", state = "ready", onRetry, systemsHref = "/workspace?view=apps" }: {
  provider: string;
  systemsHref?: string;
  freshness?: string;
  orders: readonly StoreOrderRead[];
  total?: number;
  status?: "connected" | "not_connected" | "unknown";
  state?: "ready" | "loading" | "error" | "empty" | "permission";
  onRetry?: () => void;
}) {
  return <StPage>
    <StHead crumb={{ label: "Systems", href: systemsHref }} title={`Store · ${provider}`} beacon={status === "connected" ? "live" : status === "not_connected" ? "down" : "draft"} meta={`A Connection · ${status === "connected" ? "Connected" : status === "not_connected" ? "Not connected" : "Connection not verified"} · Strelva reads orders · ${state === "ready" || state === "empty" ? freshness ?? "Latest read not recorded" : "Latest read unavailable"}`} />
    <StNotice icon={<Eye size={16} aria-hidden="true" />}>Read only. Prices, refunds and stock stay in {provider}. Strelva uses orders for your weekly recap and to answer questions about orders.</StNotice>
    {state === "loading" ? <div className={styles.stack}><p role="status">Reading orders…</p><StSkeleton label="Reading orders" /><StSkeleton width="70%" /></div>
      : state === "error" ? <StNotice tone="critical">Orders could not be read. The latest order status is unavailable.{onRetry ? <StTextButton onClick={onRetry}>Try again</StTextButton> : null}</StNotice>
        : state === "permission" ? <StNotice>Your account cannot read this Store Connection. Ask the business owner for access.</StNotice>
          : state === "empty" || !orders.length ? <StEmpty>No orders are available from this Connection.</StEmpty>
            : <><StRows label="Orders">{orders.map(order => <StRow key={order.id} lead={<StMono tone="text">{order.number}</StMono>} title={null} detail={order.description} end={<div className={styles.orderEnd}><StMono tone="text">{order.amount}</StMono><span className={styles.status}>{order.status}</span><StMono as={order.dateTime ? "time" : "span"} dateTime={order.dateTime}>{order.at}</StMono></div>} />)}</StRows>
              <p className={styles.caption}>Showing the latest <StMono>{orders.length}</StMono>{total !== undefined ? <> of <StMono>{total}</StMono></> : null} orders.</p></>}
  </StPage>;
}
