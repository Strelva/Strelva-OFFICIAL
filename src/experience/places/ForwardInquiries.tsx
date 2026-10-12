"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StMono, StNotice, StPill, StSection, StSegmented, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import type { ForwardingView } from "@/products/inquiry-forwarding/contracts";
import { FORWARDING_HOSTS, hostSteps, type ForwardingHostId } from "@/products/inquiry-forwarding/hosts";
import { whenLabel } from "./WorkspacePlace";

/**
 * Forward your inquiries: the business keeps its inbox and its forms, and
 * sends inquiry email to one Strelva address. Reads and changes go through
 * /api/workspace/inquiry-forwarding, where the database decides who may act.
 */

const POLL_MS = 5_000;
const TEST_WINDOW_MS = 10 * 60_000;

type Load = { kind: "loading" } | { kind: "ready"; view: ForwardingView } | { kind: "error"; message: string };

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

export function ForwardInquiries({ workspaceId }: { workspaceId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState<"issue" | "rotate" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState<ForwardingHostId>("gmail");
  const [testSince, setTestSince] = useState<{ at: number; latestId: string | null; hadConfirmation: boolean } | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);

  const read = useCallback(async (): Promise<ForwardingView | null> => {
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
  }, [workspaceId]);

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
    if (busy) return;
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
      }
    } catch {
      setError("This couldn't be confirmed. Reload to see the current address before trying again.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  const guide = FORWARDING_HOSTS.find((item) => item.id === host)!;
  const email = view?.address?.email ?? null;

  return <StSection title="Forward your inquiries" id="forward-inquiries">
    <p className="text-sm leading-6 text-gray-muted">Keep your inbox and your forms. Forward inquiry email to your Strelva address and each one shows up here, with nothing to log in to. Strelva never replies on its own.</p>
    {load.kind === "loading" ? <div role="status" className="grid gap-2"><span className="sr-only">Loading your forwarding address</span><StSkeleton /><StSkeleton width="60%" /></div> : null}
    {load.kind === "error" ? <StNotice tone="critical" action={<StTextButton onClick={() => { setLoad({ kind: "loading" }); void read(); }}>Try again</StTextButton>}>{load.message}</StNotice> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    {view && !view.address ? (view.canManage
      ? <div className="mt-2"><StPill busy={busy === "issue"} disabled={Boolean(busy)} onClick={() => void change("issue")}>Get my forwarding address</StPill></div>
      : <p className="text-sm">The owner hasn&apos;t set up forwarding yet.</p>) : null}
    {view?.address && email ? <div className="mt-2 grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <StMono size="value"><span className="break-all">{email}</span></StMono>
        <StTextButton onClick={() => void copy(email)} aria-label={`Copy ${email}`}>{copied ? "Copied" : "Copy"}</StTextButton>
      </div>
      <p role="status" className="text-sm">{testArrived ? `Your test arrived. Forwarding works. ${arrivedLabel(view)}` : arrivedLabel(view)}</p>
      {view.address.providerConfirmation ? <StNotice tone="need" action={view.address.providerConfirmation.url ? <StTextButton href={view.address.providerConfirmation.url} target="_blank" rel="noreferrer noopener">Open Gmail&apos;s confirmation</StTextButton> : undefined}>
        Gmail asked to confirm forwarding{view.address.providerConfirmation.requestedBy ? ` from ${view.address.providerConfirmation.requestedBy}` : ""}. Confirmation code: <StMono>{view.address.providerConfirmation.code}</StMono>
      </StNotice> : null}
      <div className="grid gap-3">
        <StSegmented label="Where your email is" value={host} options={FORWARDING_HOSTS.map((item) => ({ value: item.id, label: item.label }))} onChange={setHost} />
        <p className="text-sm text-gray-muted">{guide.summary}</p>
        <ol className="grid list-decimal gap-2 pl-5 text-sm leading-6">{hostSteps(guide, email).map((step) => <li key={step} className="break-words">{step}</li>)}</ol>
        {guide.notes.length ? <ul className="grid gap-1 text-sm text-gray-muted">{guide.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
        {guide.confirmsAddress && !view.address.providerConfirmation && !view.address.firstReceivedAt ? <p className="text-sm text-gray-muted">After you add the address in Gmail, choose I added it in Gmail and the confirmation code shows here.</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StPill variant="soft" disabled={polling} onClick={() => setTestSince({ at: Date.now(), latestId: view.latest?.id ?? null, hadConfirmation: Boolean(view.address?.providerConfirmation) })}>{polling ? "Watching for it…" : guide.confirmsAddress && !view.address.providerConfirmation && !view.address.firstReceivedAt ? `I added it in ${guide.label.split(" ")[0]}` : "I sent a test"}</StPill>
        {polling ? <span className="text-sm text-gray-muted">This checks every few seconds for 10 minutes.</span> : watching ? <span className="text-sm text-gray-muted">Nothing arrived in 10 minutes. Check the rule or forward one email by hand, then try again.</span> : null}
      </div>
      {view.canManage ? <div className="grid gap-2 text-sm">
        {confirmRotate ? <StNotice tone="need" action={<span className="flex gap-3"><StTextButton onClick={() => void change("rotate")} disabled={Boolean(busy)}>Make a new address</StTextButton><StTextButton onClick={() => setConfirmRotate(false)}>Keep this one</StTextButton></span>}>
          The current address stops working at once. Update every forwarding rule and form to the new one.
        </StNotice> : <div className="flex flex-wrap gap-4">
          <StTextButton onClick={() => setConfirmRotate(true)} disabled={Boolean(busy)}>Make a new address</StTextButton>
          <StTextButton tone="danger" onClick={() => void change("revoke")} disabled={Boolean(busy)}>Stop forwarding</StTextButton>
        </div>}
      </div> : null}
      <p className="text-xs leading-5 text-gray-muted">Strelva keeps each forwarded message&apos;s sender, subject and words as an inquiry for this business, never attachments. Inquiries stay with the business and go when it is deleted. Email to a stopped address is dropped.</p>
    </div> : null}
  </StSection>;
}
