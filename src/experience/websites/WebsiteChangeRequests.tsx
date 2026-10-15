"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { StEmpty, StHead, StPage, StPill, StRow, StRows, StSection, StSkeleton, StState, StMono, StTextButton } from "@/components/ui/strelva/Kit";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { SITE_CHANGE_STAGE_LABEL, SITE_CHANGE_STAGE_LABEL_BY_CODE, siteChangeReceiptSchema, siteChangeRequestSchema, siteChangeStage, type SiteChangeReceipt, type SiteChangeRequest } from "@/products/websites/client";
import { beginFocusRecovery, type FocusRecovery } from "./focus-recovery";
import styles from "./website-change-requests.module.css";

export interface WebsiteChangeRequestsProps {
  workspaceId: string;
  systemId: string;
  siteLabel: string;
  /** `request`: the repo is the only way to change this site. `native`: content edits happen in the editor; this is for repo-level changes. */
  editing: "native" | "request";
  /** Owners and admins ask; members read. */
  canAsk: boolean;
  /** Only owners approve or decline a preview. */
  canDecide: boolean;
  /** An authorized operator records previews and deploys; server authority still applies. */
  operator: boolean;
  /**
   * Set when `sites_by_code` is on for this business: coding agents pick up
   * Requests, so Strelva sets read-backs and the page says how to connect one.
   * Null or absent renders the page as it was.
   */
  codeAgent?: { mcpUrl: string; ownerEmail: boolean } | null;
  request?: typeof fetch;
}

type LoadState = { kind: "loading" } | { kind: "ready"; requests: SiteChangeRequest[] } | { kind: "error"; message: string };
const UNCONFIRMED_REQUEST = "We couldn't confirm whether the request was filed. Your words are still here. Check this request again or reload this System to inspect Requests before filing another change.";
const UNCONFIRMED_STEP = "We couldn't confirm whether that step was recorded. Reload the page to check its receipts before trying again.";
const requestsResponse = z.object({ requests: z.array(siteChangeRequestSchema) });
const filedResponse = requestsResponse.extend({ requestId: z.string().uuid() });
const receiptResponse = z.object({ receipt: siteChangeReceiptSchema.extend({ requestId: z.string().uuid(), systemId: z.string().uuid() }) });
const errorResponse = z.object({ error: z.string() });

function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function receiptLine(receipt: SiteChangeReceipt, codeAgent = false): string {
  const byAgent = codeAgent && receipt.reportedBy === "coding_agent";
  if (receipt.kind === "preview") {
    if (!byAgent) return "A preview was recorded.";
    return ["Your agency's coding agent recorded a preview.", receipt.summary, receipt.ownerFacing === false ? "No visible change." : null].filter(Boolean).join(" ");
  }
  if (receipt.kind === "approved") return "Approved by the owner.";
  if (receipt.kind === "declined") return "Declined by the owner. Nothing on the site changed.";
  const read = receipt.readBack === "confirmed" ? "Checked on the live site." : receipt.readBack === "not_confirmed" ? "Not yet confirmed on the live site." : "Not checked on the live site yet.";
  if (byAgent) return `Your agency's coding agent recorded the deploy (commit ${receipt.commitSha?.slice(0, 7)}). ${read}`;
  return `Deployed (commit ${receipt.commitSha?.slice(0, 7)}). ${read}`;
}

/**
 * "Ask for a change" on a website whose changes go through its own repo.
 * Filing makes a Request to the selected agency at Asked: nothing on the site changes and
 * nothing is accepted until scope and timing are agreed. Each Request shows
 * its receipts in order: preview, the owner's decision, the deploy with its
 * read-back.
 */
export function WebsiteChangeRequests(props: WebsiteChangeRequestsProps) {
  return <WebsiteChangeRequestsContent key={`${props.workspaceId}:${props.systemId}`} {...props} />;
}

function WebsiteChangeRequestsContent({ workspaceId, systemId, siteLabel, editing, canAsk, canDecide, operator, codeAgent = null, request: requestOverride }: WebsiteChangeRequestsProps) {
  const contextRequest = useWorkspaceRequest();
  const request = requestOverride ?? contextRequest;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [words, setWords] = useState("");
  const [page, setPage] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const filing = useRef(false);
  const attempt = useRef<{ body: string; text: string } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const recording = useRef(false);
  const stepNeedsReload = useRef(false);
  const [stepUnconfirmed, setStepUnconfirmed] = useState(false);
  const [stepError, setStepError] = useState("");
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const labels = codeAgent ? SITE_CHANGE_STAGE_LABEL_BY_CODE : SITE_CHANGE_STAGE_LABEL;
  const mcpCommand = codeAgent ? `claude mcp add --transport http strelva ${codeAgent.mcpUrl}` : "";
  async function copyCommand() {
    try { await navigator.clipboard.writeText(mcpCommand); setCopied("copied"); } catch { setCopied("failed"); }
  }

  const scope = useRef<HTMLElement>(null);
  const reloadReceipts = useRef<HTMLButtonElement>(null);
  const stepAlert = useRef<HTMLParagraphElement>(null);
  const stepRecovery = useRef<FocusRecovery | null>(null);
  useEffect(() => () => stepRecovery.current?.cancel(), []);
  useEffect(() => {
    if (!busyStep && stepRecovery.current) {
      stepRecovery.current.recover(stepUnconfirmed ? reloadReceipts.current : stepAlert.current, stepUnconfirmed);
      stepRecovery.current = null;
    }
  }, [busyStep, stepUnconfirmed, stepError]);

  const load = useCallback(async () => {
    try {
      const response = await request(`/api/workspace/site-changes?${new URLSearchParams({ workspaceId, systemId })}`, { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      const result = requestsResponse.safeParse(body), error = errorResponse.safeParse(body);
      if (!response.ok || !result.success) { setState({ kind: "error", message: error.success ? error.data.error : "Requests for this site can't be read right now." }); return; }
      setState({ kind: "ready", requests: result.data.requests });
    } catch {
      setState({ kind: "error", message: "Requests for this site can't be read right now." });
    }
  }, [request, systemId, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = words.trim();
    if (!canAsk || filing.current || (!attempt.current && text.length < 3)) return;
    filing.current = true;
    const checking = attempt.current !== null;
    const current = attempt.current ?? { text, body: JSON.stringify({ action: "ask", workspaceId, systemId, request: text, ...(page.trim() ? { page: page.trim() } : {}), idempotencyKey: `site-change:${crypto.randomUUID()}` }) };
    attempt.current = current;
    setSending(true);
    setNotice(null);
    try {
      const response = await request("/api/workspace/site-changes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: current.body,
      });
      const body: unknown = await response.json().catch(() => null);
      const result = filedResponse.safeParse(body), error = errorResponse.safeParse(body);
      const filedId = result.success ? result.data.requestId : null;
      const exact = result.success && result.data.requests.some(item => item.id === filedId && item.request === current.text);
      if (!response.ok || !result.success || !exact) {
        // Only these initial route refusals precede filing. A later refusal
        // cannot settle an earlier unknown attempt; even 403/409 may follow
        // the committed save when the request-list read is refused.
        if (!checking && !response.ok && [400, 401, 404, 429].includes(response.status)) {
          attempt.current = null; setUnconfirmed(false);
          setNotice({ kind: "error", message: `${error.success ? error.data.error : "That request was refused."} Your words are still here; correct the problem before filing again.` });
        } else {
          setUnconfirmed(true);
          setNotice({ kind: "error", message: [error.success ? error.data.error : null, UNCONFIRMED_REQUEST].filter(Boolean).join(" ") });
        }
        return;
      }
      attempt.current = null; setUnconfirmed(false);
      setWords("");
      setPage("");
      setState({ kind: "ready", requests: result.data.requests });
      setNotice({ kind: "success", message: "Filed with the selected agency. Scope and timing still need agreement. Nothing on the site changed." });
    } catch {
      setUnconfirmed(true);
      setNotice({ kind: "error", message: UNCONFIRMED_REQUEST });
    } finally {
      filing.current = false;
      setSending(false);
    }
  }

  async function step(requestId: string, payload: Record<string, unknown>) {
    const ownerDecision = payload.kind === "approved" || payload.kind === "declined";
    if ((ownerDecision ? !canDecide : !operator) || recording.current || stepNeedsReload.current) return;
    recording.current = true;
    stepRecovery.current = beginFocusRecovery(scope.current);
    setBusyStep(requestId);
    setNotice(null);
    try {
      const response = await request("/api/workspace/site-changes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record", workspaceId, requestId, ...(codeAgent && payload.kind === "deployed" ? { systemId } : {}), step: payload }),
      });
      const body: unknown = await response.json().catch(() => null);
      const result = receiptResponse.safeParse(body), error = errorResponse.safeParse(body);
      if (!response.ok || !result.success || result.data.receipt.requestId !== requestId || result.data.receipt.systemId !== systemId || result.data.receipt.kind !== payload.kind) {
        // Recording has no retry key, and release observation can fail after
        // the receipt commits. Reconcile by reloading before another action.
        stepNeedsReload.current = true; setStepUnconfirmed(true);
        setStepError([error.success ? error.data.error : null, UNCONFIRMED_STEP].filter(Boolean).join(" "));
        return;
      }
      await load();
    } catch {
      stepNeedsReload.current = true; setStepUnconfirmed(true);
      setStepError(UNCONFIRMED_STEP);
    } finally {
      recording.current = false;
      setBusyStep(null);
    }
  }

  return <section ref={scope} aria-labelledby="site-changes-title"><StPage className={styles.wrap}>
    <StHead as="h2" titleId="site-changes-title" title={`Ask for a change to ${siteLabel}`} meta={editing === "request"
      ? "This site runs on its own code. Request a change from the selected agency and review its preview before approving publication."
      : `Text and photos on ${siteLabel} change in the editor. Request a new page, feature or design change from the selected agency, then review its preview.`} />

    {canAsk ? <form className={styles.form} onSubmit={(event) => void ask(event)}>
      <label htmlFor="site-change-words">What should change?</label>
      <textarea id="site-change-words" rows={4} maxLength={3_000} value={words} readOnly={sending || unconfirmed} placeholder="Add a private events page with a short inquiry form" onChange={(event) => { if (!filing.current && !attempt.current) setWords(event.target.value); }} />
      <label htmlFor="site-change-page">Which page? <span>Optional</span></label>
      <input id="site-change-page" maxLength={200} value={page} readOnly={sending || unconfirmed} placeholder="Home, Menu, a new page…" onChange={(event) => { if (!filing.current && !attempt.current) setPage(event.target.value); }} />
      <div className={styles.formFoot}>
        <small>A Request isn&apos;t accepted work until the selected agency agrees scope and timing with you.</small>
        <StPill type="submit" busy={sending} disabled={!unconfirmed && words.trim().length < 3}>{unconfirmed ? "Check this request" : "Ask for a change"}</StPill>
      </div>
    </form> : <p className={styles.readOnly}>Only an owner or admin of this business can ask for a change. You can follow each request here.</p>}

    {notice ? <p role={notice.kind === "error" ? "alert" : "status"} className={styles.notice} data-kind={notice.kind}>{notice.kind === "error" ? <CircleAlert size={16} aria-hidden="true" /> : null}{notice.message}</p> : null}

    {stepError ? <p ref={stepAlert} tabIndex={-1} role="alert" className={styles.notice} data-kind="error"><CircleAlert size={16} aria-hidden="true" />{stepError}</p> : null}
    {stepUnconfirmed ? <StPill ref={reloadReceipts} type="button" variant="soft" disabled={busyStep !== null} onClick={() => { if (!recording.current) window.location.reload(); }}>Reload receipts</StPill> : null}

    <StSection title="Requests for this site" id="site-changes-list-title">
      {state.kind === "loading" ? <StSkeleton label="Loading requests…" />
        : state.kind === "error" ? <p role="alert" className={styles.muted}>{state.message} <StTextButton onClick={() => void load()}>Try again</StTextButton></p>
        : state.requests.length === 0 ? <StEmpty>Nothing asked yet. Requests and their previews show here.</StEmpty>
        : <StRows>{state.requests.map((item) => {
          const stage = siteChangeStage(item);
          const preview = [...item.receipts].reverse().find((receipt) => receipt.kind === "preview");
          return <StRow key={item.id} align="start" title={item.request} detail={<StState kind={stage === "done" ? "live" : stage === "ready_for_review" || stage === "done_unconfirmed" ? "need" : "draft"}>{labels[stage]}</StState>}>
            {item.receipts.length ? <ul className={styles.receipts} aria-label="Receipts">{item.receipts.map((receipt) => <li key={receipt.id}>
              <span>{receiptLine(receipt, codeAgent !== null)}</span>
              {receipt.kind === "preview" && receipt.previewUrl ? <a href={receipt.previewUrl} target="_blank" rel="noreferrer">Open the preview<ArrowUpRight size={13} aria-hidden="true" /></a> : null}
              {receipt.kind === "deployed" && receipt.deploymentUrl ? <a href={receipt.deploymentUrl} target="_blank" rel="noreferrer">Deployment<ArrowUpRight size={13} aria-hidden="true" /></a> : null}
              {receipt.note ? <small>{receipt.note}</small> : null}
              <StMono as="time" dateTime={receipt.recordedAt}>{when(receipt.recordedAt)}</StMono>
            </li>)}</ul> : <p className={styles.muted}>Asked {when(item.createdAt)}.</p>}
            {stage === "ready_for_review" ? canDecide ? <div className={styles.decide}>
              <StPill busy={busyStep === item.id} disabled={busyStep !== null || stepUnconfirmed} onClick={() => void step(item.id, { kind: "approved" })}>Make it live</StPill>
              <StPill variant="soft" disabled={busyStep !== null || stepUnconfirmed} onClick={() => void step(item.id, { kind: "declined" })}>Not yet</StPill>
              <small>Approving authorizes {preview ? "this preview" : "it"} for publication. Deployment still requires current agency authority.</small>
            </div> : <p className={styles.muted}>Waiting on the owner to approve or decline the preview.{codeAgent && !codeAgent.ownerEmail ? " Owner email is off, so the owner wasn't emailed. They see this in Needs you when they sign in." : ""}</p> : null}
            {stage === "ready_for_review" && canDecide && codeAgent ? <p className={styles.muted}>This is also waiting in Needs you.</p> : null}
            {operator && item.status === "requested" ? <OperatorStep stage={stage} byCode={codeAgent !== null} busy={busyStep === item.id} blocked={busyStep !== null || stepUnconfirmed} onRecord={(payload) => void step(item.id, payload)} /> : null}
          </StRow>;
        })}</StRows>}
    </StSection>

    {codeAgent ? <StSection title="Use a coding agent" id="site-changes-agent-title">
      <p className={styles.muted}>Connect Claude Code or another coding agent to Strelva:</p>
      <div className={styles.command}><StMono>{mcpCommand}</StMono></div>
      <div className={styles.decide}>
        <StPill variant="soft" onClick={() => void copyCommand()}>Copy the command</StPill>
        {copied ? <small role="status">{copied === "copied" ? "Copied" : "Copy failed. Select the command and copy it."}</small> : null}
      </div>
      <p className={styles.muted}>Then ask it: “Pick up the Strelva Requests for {siteLabel}.” It reads Requests your agency accepted, records a preview and records the deploy. It can&apos;t approve. You make it live.</p>
      {canDecide && !operator ? <p className={styles.muted}>Your own coding agent can also record releases you ship yourself.</p> : null}
    </StSection> : null}
  </StPage></section>;
}

/** Record a preview, or the deploy after the owner approved. Operators only; the database checks it. */
function OperatorStep({ stage, byCode, busy, blocked, onRecord }: { stage: ReturnType<typeof siteChangeStage>; byCode: boolean; busy: boolean; blocked: boolean; onRecord: (payload: Record<string, unknown>) => void }) {
  const [url, setUrl] = useState("");
  const [commit, setCommit] = useState("");
  const [readBack, setReadBack] = useState<"confirmed" | "not_confirmed" | "not_checked">("not_checked");
  let form: React.ReactNode = null;
  if (stage === "approved") {
    form = <form className={styles.operator} onSubmit={(event) => { event.preventDefault(); if (!blocked) onRecord({ kind: "deployed", commitSha: commit.trim(), deploymentUrl: url.trim(), ...(byCode ? {} : { readBack }) }); }}>
      <p>Record the deploy</p>
      <label>Commit<input value={commit} readOnly={blocked} onChange={(event) => setCommit(event.target.value)} placeholder="abc1234" /></label>
      <label>Deployment URL<input value={url} readOnly={blocked} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
      {byCode ? <p>Strelva checks the live site itself, so there is no read-back to choose.</p>
        : <label>Read-back<select value={readBack} disabled={blocked} onChange={(event) => setReadBack(event.target.value as typeof readBack)}><option value="confirmed">Confirmed on the live site</option><option value="not_confirmed">Not confirmed</option><option value="not_checked">Not checked yet</option></select></label>}
      <StPill type="submit" busy={busy} disabled={blocked}>Record deploy</StPill>
    </form>;
  } else if (stage !== "ready_for_review" && stage !== "done" && stage !== "done_unconfirmed") {
    form = <form className={styles.operator} onSubmit={(event) => { event.preventDefault(); if (!blocked) onRecord({ kind: "preview", previewUrl: url.trim() }); }}>
      <p>Record a preview for the owner</p>
      <label>Preview URL<input value={url} readOnly={blocked} onChange={(event) => setUrl(event.target.value)} placeholder="https://…vercel.app" /></label>
      <StPill type="submit" busy={busy} disabled={blocked}>Record preview</StPill>
    </form>;
  }
  if (!form || !byCode) return form;
  return <details className={styles.byHand}><summary>Record by hand</summary><p className={styles.muted}>Your agency&apos;s coding agent records previews and deploys. Use this only if it can&apos;t.</p>{form}</details>;
}
