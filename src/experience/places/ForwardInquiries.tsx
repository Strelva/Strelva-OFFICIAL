"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaSays, XaStatus, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { CopyButton } from "@/experience/connections/CopyButton";
import styles from "@/experience/connections/xa-connections.module.css";
import type { ForwardingView } from "@/products/inquiry-forwarding/contracts";
import { FORWARDING_HOSTS, type ForwardingHostId } from "@/products/inquiry-forwarding/contracts";
import { whenLabel } from "./WorkspacePlace";

/**
 * Forward your inquiries: the business keeps its inbox and its forms, and
 * sends inquiry email to one Strelva address. Reads and changes go through
 * /api/workspace/inquiry-forwarding, where the database decides who may act.
 */

const POLL_MS = 5_000;
const TEST_WINDOW_MS = 10 * 60_000;

export type Load = { kind: "loading" } | { kind: "ready"; view: ForwardingView } | { kind: "error"; message: string };

export function forwardingErrorMessage(status: number, body: { error?: string } | null): string {
  if (status === 401) return "Sign in again to continue. Nothing changed.";
  if (status === 403) return "Only the owner, an admin or the agency running inquiries can change this. Nothing changed.";
  if (status === 429) return "Please wait a moment and try again.";
  if ([400, 409, 503].includes(status) && body?.error) return body.error;
  return "This couldn't be confirmed. Reload to see the current address before trying again.";
}

function arrivedLabel(view: ForwardingView): string {
  const latest = view.latest;
  if (!latest) return "Nothing has arrived yet.";
  const held = latest.intakeState === "held_as_spam" ? " It looked like spam, so it's held for you below." : "";
  return `Last arrived ${whenLabel(latest.capturedAt, true)}: ${latest.name}${latest.subject ? `, “${latest.subject}”` : ""}.${held}`;
}

/**
 * A host step with "{address}" read as "your forwarding address (Copy)": the
 * full address shows once, above; each step points back to it with a copy.
 */
function stepWords(step: string, email: string): ReactNode {
  const parts = step.split("{address}");
  return parts.map((part, index) => <Fragment key={index}>{part}{index < parts.length - 1 ? <>your forwarding <span className={styles.nowrap}>address (<CopyButton value={email} label="your forwarding address" variant="text" inline />)</span></> : null}</Fragment>);
}

/** `fixture` (preview only) renders a fixed state and makes no requests. */
export function ForwardInquiries({ workspaceId, fixture }: { workspaceId: string; fixture?: Load }) {
  const [load, setLoad] = useState<Load>(fixture ?? { kind: "loading" });
  const [busy, setBusy] = useState<"issue" | "rotate" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState<ForwardingHostId>("gmail");
  const [testSince, setTestSince] = useState<{ at: number; latestId: string | null; hadConfirmation: boolean } | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const mounted = useRef(true);

  const read = useCallback(async (): Promise<ForwardingView | null> => {
    if (fixture) return null;
    try {
      const response = await fetch(`/api/workspace/inquiry-forwarding?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { forwarding?: ForwardingView; error?: string } | null;
      if (!mounted.current) return null;
      if (!response.ok || !body?.forwarding) {
        setLoad({ kind: "error", message: forwardingErrorMessage(response.status, body) });
        return null;
      }
      setLoad({ kind: "ready", view: body.forwarding });
      return body.forwarding;
    } catch {
      if (mounted.current) setLoad({ kind: "error", message: "The forwarding address couldn't load. Reload to try again." });
      return null;
    }
  }, [workspaceId, fixture]);

  useEffect(() => {
    mounted.current = true;
    void read();
    return () => { mounted.current = false; };
  }, [read]);

  const view = load.kind === "ready" ? load.view : null;
  const testArrived = Boolean(testSince && view?.latest && view.latest.id !== testSince.latestId);
  const confirmationArrived = Boolean(testSince && !testSince.hadConfirmation && view?.address?.providerConfirmation);
  const watching = Boolean(view?.address && testSince && !testArrived && !confirmationArrived);
  const polling = watching && Date.now() - (testSince?.at ?? 0) < TEST_WINDOW_MS;

  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => { void read(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, read]);

  async function change(action: "issue" | "rotate" | "revoke") {
    if (busy || fixture) return;
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/workspace/inquiry-forwarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "revoke" ? { action, workspaceId, addressId: view?.address?.id } : { action, workspaceId }),
      });
      const body = await response.json().catch(() => null) as { forwarding?: ForwardingView; error?: string } | null;
      if (!response.ok || !body?.forwarding) setError(forwardingErrorMessage(response.status, body));
      else {
        setLoad({ kind: "ready", view: body.forwarding });
        setTestSince(null);
        setConfirmRotate(false);
        setConfirmStop(false);
      }
    } catch {
      setError("This couldn't be confirmed. Reload to see the current address before trying again.");
    } finally {
      setBusy(null);
    }
  }

  const guide = FORWARDING_HOSTS.find((item) => item.id === host)!;
  const email = view?.address?.email ?? null;

  const added = view?.address ? Boolean(view.latest || view.address.firstReceivedAt) : false;
  const waitingOnGmail = guide.confirmsAddress && !view?.address?.providerConfirmation && !view?.address?.firstReceivedAt;
  return <section className={styles.section} id="forward-inquiries" aria-labelledby="forward-inquiries-heading">
    <h2 id="forward-inquiries-heading" className={styles.sectionTitle}>Forward your inquiries</h2>
    <p className={styles.quiet}>Keep your inbox and your forms. Forward inquiry email to your Strelva address and each one shows up here, with nothing to log in to. Strelva never replies on its own.</p>
    {load.kind === "loading" ? <div role="status" className={styles.stack}><span className={styles.srOnly}>Loading your forwarding address</span><StSkeleton /><StSkeleton width="60%" /></div> : null}
    {load.kind === "error" ? <div role="alert"><XaSays links={[<XaTextLink key="retry" onClick={() => { setLoad({ kind: "loading" }); void read(); }}>Try again</XaTextLink>]}>{load.message}</XaSays></div> : null}
    {error ? <div role="alert"><XaSays>{error}</XaSays></div> : null}
    {view && !view.address ? (view.canManage
      ? <div className={styles.actions}><XaButton busy={busy === "issue"} disabled={Boolean(busy)} onClick={() => void change("issue")}>Get my forwarding address</XaButton></div>
      : <p className={styles.quiet}>The owner hasn&apos;t set up forwarding yet.</p>) : null}
    {view?.address && email ? <div className={styles.section}>
      <ul className={styles.group}>
        <li className={styles.groupRow}>
          <span className={styles.groupText}><span className={styles.groupDetail}>Your forwarding address</span><span className={styles.addressValue}>{email}</span></span>
          <span className={styles.groupEnd}><CopyButton value={email} label="your forwarding address" /></span>
        </li>
        <li className={styles.groupRow}><span className={styles.groupText}><span className={styles.groupDetail} role="status">{testArrived ? `Your test arrived. Forwarding works. ${arrivedLabel(view)}` : arrivedLabel(view)}</span></span>
          <span className={styles.groupEnd}>{testArrived || added ? <XaStatus kind="live" size="sm">Receiving</XaStatus> : view.address.providerConfirmation ? <XaStatus kind="waits" size="sm">Gmail waits for you</XaStatus> : <XaStatus kind="draft" size="sm">Nothing yet</XaStatus>}</span></li>
      </ul>
      {view.address.providerConfirmation ? <XaSays links={view.address.providerConfirmation.url ? [<a key="gmail" className={styles.textButton} href={view.address.providerConfirmation.url} target="_blank" rel="noreferrer noopener">Open Gmail&apos;s confirmation</a>] : undefined}>
        Gmail asked to confirm forwarding{view.address.providerConfirmation.requestedBy ? ` from ${view.address.providerConfirmation.requestedBy}` : ""}. The confirmation code is <span className={styles.figure}><strong>{view.address.providerConfirmation.code}</strong></span>.
      </XaSays> : null}
      <div className={styles.section}>
        <label className={styles.fieldLabel}>Where your email is<select className={styles.select} value={host} onChange={event => setHost(event.target.value as ForwardingHostId)}>{FORWARDING_HOSTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <p className={styles.quiet}>{guide.summary}</p>
        {added ? <details className={styles.disclosure}>
          <summary>Show the steps</summary>
          <div className={styles.disclosureBody}>
            <ol className={styles.steps}>{guide.steps.map(step => <li key={step} className={styles.step}><span>{stepWords(step, email)}</span></li>)}</ol>
            {guide.notes.length ? <ul className={styles.plainList}>{guide.notes.map(note => <li key={note} className={styles.small}>{note}</li>)}</ul> : null}
          </div>
        </details> : <>
          <ol className={styles.steps}>{guide.steps.map(step => <li key={step} className={styles.step}><span>{stepWords(step, email)}</span></li>)}</ol>
          {guide.notes.length ? <ul className={styles.plainList}>{guide.notes.map(note => <li key={note} className={styles.small}>{note}</li>)}</ul> : null}
        </>}
        {waitingOnGmail && !view.address.providerConfirmation ? <p className={styles.small}>After you add the address in Gmail, choose I added it in Gmail and the confirmation code shows here.</p> : null}
      </div>
      {polling ? <XaWorking title={waitingOnGmail ? "Watching for Gmail's confirmation" : "Watching for your test"} steps={[{ id: "watch", label: "Checking every few seconds for 10 minutes", state: "active" }]} />
        : <div className={styles.actions}>
          <XaButton onClick={() => setTestSince({ at: Date.now(), latestId: view.latest?.id ?? null, hadConfirmation: Boolean(view.address?.providerConfirmation) })}>{waitingOnGmail ? `I added it in ${guide.label.split(" ")[0]}` : "I sent a test"}</XaButton>
          {watching ? <span className={styles.quiet}>Nothing arrived in 10 minutes. Check the rule or forward one email by hand, then try again.</span> : null}
        </div>}
      {view.canManage ? confirmRotate ? <div className={styles.section}><XaSays>The current address stops working at once. Update every forwarding rule and form to the new one.</XaSays>
        <div className={styles.actions}><XaButton size="sm" onClick={() => void change("rotate")} disabled={Boolean(busy)} busy={busy === "rotate"}>Make a new address</XaButton><button type="button" className={styles.textButton} onClick={() => setConfirmRotate(false)}>Keep this one</button></div></div>
        : confirmStop ? <div className={styles.section}><XaSays>Email sent to this address after you stop is dropped, not kept. Inquiries already here stay.</XaSays>
          <div className={styles.actions}><button type="button" className={styles.danger} onClick={() => void change("revoke")} disabled={Boolean(busy)}>Stop forwarding</button><button type="button" className={styles.textButton} onClick={() => setConfirmStop(false)}>Keep forwarding</button></div></div>
          : <div className={styles.actions}>
            <button type="button" className={styles.textButton} onClick={() => setConfirmRotate(true)} disabled={Boolean(busy)}>Make a new address</button>
            <button type="button" className={styles.danger} onClick={() => setConfirmStop(true)} disabled={Boolean(busy)}>Stop forwarding</button>
          </div> : null}
      <p className={styles.small}>Strelva keeps each forwarded message&apos;s sender, subject and words as an inquiry for this business, never attachments. Inquiries stay with the business and go when it is deleted. Email to a stopped address is dropped.</p>
    </div> : null}
  </section>;
}
