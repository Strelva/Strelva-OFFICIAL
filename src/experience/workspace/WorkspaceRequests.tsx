"use client";

import { ArrowRight, ArrowUpRight, ListChecks, MessageSquareText } from "lucide-react";
import type { WorkspaceWork } from "./contracts";
import { REQUEST_STAGE_LABELS, type BusinessDeliveryItem, type BusinessRequestStage } from "./business-delivery-summary";
import { useBusinessDeliveries } from "./useBusinessDeliveries";
import styles from "./workspace-surface.module.css";

/** One row on the Requests page: a request to Strelva or an agency, or a finite job saved in the workspace. */
export interface BusinessRequestRow {
  id: string;
  title: string;
  stage: BusinessRequestStage;
  detail: string;
  href?: string;
  workId?: string;
  sortAt: string;
}

const GROUPS: readonly { stage: BusinessRequestStage; heading: string }[] = [
  { stage: "needs_you", heading: "Needs you" },
  { stage: "ready_for_review", heading: "Ready for your review" },
  { stage: "in_progress", heading: "In progress" },
  { stage: "asked", heading: "Asked" },
  { stage: "done", heading: "Done" },
];

/** Finite responsibilities have an end, so they are requests; standing ones live in Running. */
export function finiteJobStage(status: string | undefined): BusinessRequestStage {
  if (status === "proposed" || status === "needs_attention") return "needs_you";
  if (status === "completed") return "done";
  if (status === "cancelled") return "closed";
  return "in_progress";
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Who is doing a request, by name. */
export function deliveryProviderName(item: BusinessDeliveryItem, agencyNames: ReadonlyMap<string, string>): string {
  return item.provider?.kind === "agency" ? agencyNames.get(item.provider.agencyWorkspaceId) || "your agency" : item.provider?.kind === "strelva" ? "Strelva Agency" : "";
}

export function businessRequestRows(deliveries: readonly BusinessDeliveryItem[], work: readonly WorkspaceWork[], providerName: (item: BusinessDeliveryItem) => string): BusinessRequestRow[] {
  const fromDeliveries = deliveries.map(item => ({
    id: `delivery-${item.id}`,
    title: item.title,
    stage: item.stage,
    detail: item.stage === "asked" ? `Asked · waiting for ${providerName(item) || "the provider"} to agree scope and deadline`
      : item.stage === "done" ? ["Done", providerName(item) ? `by ${providerName(item)}` : null].filter(Boolean).join(" · ")
      : [item.detail, item.dueAt && item.stage !== "closed" ? `due ${shortDate(item.dueAt)}` : null, providerName(item) ? `by ${providerName(item)}` : null].filter(Boolean).join(" · "),
    href: item.href,
    sortAt: item.updatedAt || "",
  }));
  const fromJobs = work.filter(item => item.productId === "operations" && item.resourceKind === "responsibility").map(item => {
    const stage = finiteJobStage(item.operation?.status);
    return {
      id: `work-${item.id}`,
      title: item.title,
      stage,
      detail: stage === "needs_you" ? item.operation?.reason || "Needs your decision before it continues" : `${REQUEST_STAGE_LABELS[stage]} · started ${shortDate(item.createdAt)}`,
      workId: item.id,
      sortAt: item.createdAt,
    };
  });
  return [...fromDeliveries, ...fromJobs].sort((a, b) => b.sortAt.localeCompare(a.sortAt));
}

interface Props {
  businessName: string;
  /** Present only when this person may see the business's requests to Strelva or an agency. */
  deliveryScope?: string;
  work: readonly WorkspaceWork[];
  agencyNames: ReadonlyMap<string, string>;
  readOnly: boolean;
  busy: boolean;
  onOpenWork: (id: string) => void;
  onAsk: () => void;
}

/** Things someone asked for that have an end: asked, agreed, in progress, ready for review, done. */
export function WorkspaceRequests({ businessName, deliveryScope, work, agencyNames, readOnly, busy, onOpenWork, onAsk }: Props) {
  const deliveries = useBusinessDeliveries(deliveryScope);
  const items = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const providerName = (item: BusinessDeliveryItem) => deliveryProviderName(item, agencyNames);
  const rows = businessRequestRows(items, work, providerName);
  const closed = rows.filter(row => row.stage === "closed");
  const loading = busy || deliveries.state.status === "loading";

  function row(entry: BusinessRequestRow) {
    const body = <><ListChecks size={20} strokeWidth={1.5} aria-hidden="true" /><span><strong>{entry.title}</strong><small>{entry.detail}</small></span><ArrowUpRight size={17} aria-hidden="true" /></>;
    return <li key={entry.id}>{entry.href ? <a className={styles.workRow} href={entry.href}>{body}</a> : <button type="button" className={styles.workRow} aria-label={`Open ${entry.title}`} onClick={() => entry.workId && onOpenWork(entry.workId)}>{body}</button>}</li>;
  }

  return <div className={styles.page} aria-labelledby="requests-title">
    <header className={styles.pageHeader}>
      <p className={styles.eyebrow}>{readOnly ? "Shared with you" : businessName}</p>
      <h1 id="requests-title">Requests</h1>
      <p>Things you asked for that have an end. A request becomes agreed work once its scope and deadline are accepted.</p>
    </header>
    {!readOnly ? <button type="button" className={styles.secondaryAction} onClick={onAsk}><MessageSquareText size={17} aria-hidden="true" />Ask Strelva for something</button> : null}
    {deliveries.state.status === "disabled" ? <p className={styles.emptyNote}>Requests made to Strelva or an agency are visible to the owners and admins of {businessName}.</p> : null}
    {deliveries.state.status === "error" ? <p role="status" className={styles.emptyNote}>{deliveries.state.message} <button type="button" className={styles.textAction} onClick={deliveries.refresh}>Check again<ArrowRight size={15} aria-hidden="true" /></button></p> : null}
    {loading ? <p role="status" className={styles.emptyNote}>Checking your requests…</p> : rows.length === 0 ? <div className={styles.empty}>
      {readOnly || deliveries.state.status === "disabled" ? <h2>No requests you can see.</h2> : <>
        <h2>Nothing asked yet.</h2>
        <p>Ask Strelva for something with an end: a new page, an intake form, a launch. It shows up here with its stage and due date.</p>
      </>}
    </div> : <>
      {GROUPS.map(group => {
        const entries = rows.filter(entry => entry.stage === group.stage);
        if (!entries.length) return null;
        const id = `requests-${group.stage}`;
        return <section key={group.stage} aria-labelledby={id} className="mt-10">
          <div className={styles.sectionHeading}><h2 id={id}>{group.heading}</h2><span className="text-sm text-gray-muted">{entries.length}</span></div>
          <ul className={styles.workList} role="list">{entries.map(row)}</ul>
        </section>;
      })}
      {closed.length ? <details className="mt-10"><summary className="cursor-pointer py-3 text-sm text-gray-muted">Closed ({closed.length})</summary><ul className={styles.workList} role="list">{closed.map(row)}</ul></details> : null}
    </>}
  </div>;
}
