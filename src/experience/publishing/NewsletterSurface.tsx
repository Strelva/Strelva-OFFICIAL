"use client";

import { useState, type ReactNode } from "react";
import { StEmpty, StField, StLabel, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import type { ContentWorkspaceData } from "./ContentWorkspace";
import styles from "./publishing.module.css";

/** Optional presentation facts. Only the local preview supplies these today. */
export interface NewsletterContext {
  subscribers: number; sender: string; sendAt: string; lastIssueLabel: string;
  bounced: number | null; unsubscribed: number | null;
  article?: { label: string; href: string };
}

export function NewsletterSurface({ data, context, busy, canApprove, command }: {
  data: ContentWorkspaceData; context?: NewsletterContext; busy: boolean; canApprove: boolean;
  command: (action: "approve" | "not_yet", eventId: string) => void;
}) {
  const drafts = data.content.drafts.filter(draft => draft.status === "pending" || draft.status === "dismissed");
  return <>
    {!drafts.length && !data.content.outputs.length ? <StEmpty>No issues yet. Compose an issue, then review its exact words before approving.</StEmpty> : null}
    {drafts.map((draft, index) => <article key={draft.id} aria-label={draft.title} className={styles.columns}>
      <StSurface pad={false} label="Draft issue">
        <div className={styles.objectBar}><StMono>{context?.sender ? `From ${context.sender}` : "Draft issue · sender not available"}</StMono></div>
        <div className={styles.issue}>
          <h3 className={styles.issueTitle}>{draft.title.replace(/^Approve newsletter: /, "")}</h3>
          <p className={styles.copy}>{draft.body}</p>
          {context?.article ? <StTextButton href={context.article.href}>{context.article.label} →</StTextButton> : null}
        </div>
        <div className={styles.issueFooter}>For people who signed up to receive this newsletter. Every sent issue includes an unsubscribe link.</div>
      </StSurface>
      <aside className={styles.stack} aria-label="Issue approval">
        <StLabel>{context ? "Proposed send" : "Sending"}</StLabel>
        {context ? <><strong>{context.sendAt}</strong><p className={styles.copy}>To <StMono>{context.subscribers}</StMono> subscribers</p></> : null}
        <StState kind={draft.status === "pending" ? "need" : "draft"}>{draft.status === "pending" ? "Draft · needs your approval" : "Declined"}</StState>
        <p className={styles.copy}>Sending is paused. Approval keeps this issue and its receipt; no subscriber receives email.</p>
        {canApprove && draft.status === "pending" ? <>
          <StPill disabled={busy} onClick={() => command("approve", draft.id)}>Save approved issue</StPill>
          <StTextButton disabled={busy} onClick={() => command("not_yet", draft.id)}>Not yet</StTextButton>
        </> : draft.status === "pending" ? <StNotice>Only an authorized owner can approve this issue.</StNotice> : null}
        {index === 0 && data.content.outputs[0] ? <IssueEvidence issue={data.content.outputs[0]} context={context} /> : null}
      </aside>
    </article>)}
    {(drafts.length ? data.content.outputs.slice(1) : data.content.outputs).map(issue => <IssueEvidence key={issue.id} issue={issue} context={context} />)}
  </>;
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <StRow title={label} end={<StMono>{value ?? "Not available"}</StMono>} />;
}

function IssueEvidence({ issue, context }: { issue: ContentWorkspaceData["content"]["outputs"][number]; context?: NewsletterContext }) {
  const [copyStatus, setCopyStatus] = useState("");
  async function copyIssue() {
    try {
      await navigator.clipboard.writeText(`${issue.subject}\n\n${issue.body}`);
      setCopyStatus("Approved issue copied. Paste it into your email tool. Copying does not send email.");
    } catch {
      setCopyStatus("Copy is unavailable. Open Approved issue below and select its text to copy.");
    }
  }
  return <StSection title={issue.subject} meta={`${context?.lastIssueLabel || "Last issue"}, as far as Strelva knows`}>
      <StState kind={issue.delivery?.state === "accepted" ? "live" : issue.delivery?.state === "send_unconfirmed" ? "down" : "draft"}>
        {({ accepted: "Provider accepted · delivery not verified", send_unconfirmed: "Send outcome unconfirmed. Strelva must reconcile before retrying.", sending_pending: "Waiting to send", not_sent_gated: "Sending paused", not_sent_suppressed: "Not sent: no active subscribers" }[issue.delivery?.state || ""] || "Sending paused")}
      </StState>
      <StRows label="Sending evidence">
        <Metric label="Accepted by the mail provider" value={issue.delivery?.accepted ?? issue.accepted_count} />
        <Metric label="Bounced" value={context?.bounced ?? null} />
        <Metric label="Unsubscribed" value={context?.unsubscribed ?? null} />
        <Metric label="Suppressed before sending" value={issue.delivery?.suppressed ?? issue.suppressed_count} />
        <Metric label="Unconfirmed batches" value={issue.delivery?.unconfirmedBatches ?? issue.failure_count} />
      </StRows>
      <p className={styles.copy}>Strelva can&apos;t see who read it. Mail internal tools hide that. Accepted is not delivered; suppressed is not bounced or unsubscribed.</p>
      {issue.delivery?.receipts.map(receipt => <p key={receipt.id} className={styles.copy}>{receipt.detail} Accepted: <StMono>{receipt.accepted}</StMono>. Suppressed: <StMono>{receipt.suppressed}</StMono>.</p>)}
      <StTextButton onClick={() => void copyIssue()}>Copy approved issue</StTextButton>
      {copyStatus ? <p role="status" className={styles.copy}>{copyStatus}</p> : null}
      <details className={styles.disclosure}><summary>Approved issue · {new Date(issue.approved_at).toLocaleDateString("en-US", { timeZone: "UTC" })}</summary><StField label="Approved issue text"><textarea readOnly rows={8} value={`${issue.subject}\n\n${issue.body}`} /></StField></details>
    </StSection>;
}
