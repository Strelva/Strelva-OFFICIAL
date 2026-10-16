"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { beginFocusRecovery, type FocusRecovery } from "@/experience/websites/focus-recovery";
import { XaButton, XaSays, XaTextArea } from "@/components/ui/strelva/Xa";
import x from "@/experience/systems/xa/system-xa.module.css";
import { InquiryBookingOfferComposer } from "./InquiryBookingOfferComposer";
import type { WorkspaceReplyOutcome, WorkspaceReplyStatus } from "@/products/inquiries";

export const REPLY_OUTCOME: Record<WorkspaceReplyStatus, string> = {
  sending: "This reply is being checked. Reload its receipt before sending anything else.",
  suppressed: "Email is paused. Nothing was sent.",
  accepted: "Sent. Delivery isn't confirmed yet.",
  delivered: "Delivered to the recipient's email provider.",
  deferred: "Sent. The recipient's email provider delayed delivery.",
  bounced: "Sent, but the recipient's email provider bounced it. Check their address.",
  failed: "The provider reported a failure. This reply won't be sent again.",
  unknown: "The send couldn't be confirmed. Strelva must check the receipt before another attempt.",
};

// Validate the existing public outcome type without importing server/node code.
const replyOutcome = z.object({
  status: z.custom<WorkspaceReplyStatus>(value => typeof value === "string" && Object.hasOwn(REPLY_OUTCOME, value)),
  providerMessageId: z.string().nullable(), acceptedAt: z.string().nullable(), retryable: z.literal(false),
});

const SUBJECT = "Re: Your inquiry";

/**
 * XA · S3: the reply sits under the message, open, with Pebble saying what
 * happens and one ink "Send to <name>". "Write it myself" opens the owner's
 * own email instead. The reply starts with a greeting only; Strelva never
 * drafts an answer it has no record for. Sending approves these exact words;
 * an attempt is kept immutable until its receipt is read back.
 */
export function WorkspaceInquiryReply({ workspaceId, rowId, name, email, siteName, bookingOffers = false, member = false }: { workspaceId: string; rowId: string; name: string; email: string; siteName?: string; bookingOffers?: boolean; member?: boolean }) {
  const first = name.trim().split(/\s+/)[0] || name;
  const greeting = `Hi ${first},\n\n`;
  const [body, setBody] = useState(greeting);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<WorkspaceReplyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const checkRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const settled = useRef(false);
  const attempt = useRef<{ id: string; payload: string } | null>(null);
  const focusRecovery = useRef<FocusRecovery | null>(null);
  useEffect(() => () => focusRecovery.current?.cancel(), []);
  useEffect(() => {
    if (saving || !focusRecovery.current) return;
    focusRecovery.current.recover(outcome ? outcomeRef.current : requestId ? checkRef.current : bodyRef.current, true);
    focusRecovery.current = null;
  }, [error, outcome, requestId, saving]);
  const written = body.trim().length > 0 && body.trim() !== greeting.trim();
  async function send() {
    if (inFlight.current || settled.current) return;
    if (!attempt.current && !written) { setEmpty(true); bodyRef.current?.focus(); return; }
    inFlight.current = true;
    const checking = attempt.current !== null;
    const current = attempt.current ?? { id: crypto.randomUUID(), payload: "" };
    if (!checking) current.payload = JSON.stringify({ workspaceId, rowId, requestId: current.id, subject: SUBJECT, body });
    attempt.current = current;
    focusRecovery.current?.cancel();
    focusRecovery.current = beginFocusRecovery(sectionRef.current);
    setRequestId(current.id); setSaving(true); setError(null);
    try {
      const response = await fetch("/api/workspace/inquiries/reply", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: current.payload,
      });
      const result: unknown = await response.json().catch(() => null);
      const parsed = z.object({ outcome: replyOutcome }).safeParse(result);
      const refusal = z.object({ error: z.string() }).safeParse(result);
      if (!response.ok || !parsed.success) {
        // These initial route refusals and the exact member commitment refusal
        // are known to precede a durable claim (SQL refuses before insertion).
        // Even a 400 can be claim-schema validation after SQL acquired the claim.
        // No later denial settles an earlier unknown attempt.
        const ownerApprovalRefusal = response.status === 409 && refusal.success && refusal.data.error === "Prices, dates and promises need the business owner’s approval.";
        if (!checking && ([401, 429].includes(response.status) || ownerApprovalRefusal)) {
          attempt.current = null; setRequestId(null);
          setError(refusal.success ? refusal.data.error : "The reply was refused before sending. Your words are still here.");
        } else setError(`The reply couldn't be confirmed. Keep these exact words and check this reply before sending anything else.${refusal.success && !/\bnothing (?:was )?(?:sent|changed)\b/i.test(refusal.data.error) ? ` ${refusal.data.error}` : ""}`);
      } else { settled.current = true; setOutcome(parsed.data.outcome); }
    } catch { setError("The reply couldn't be confirmed. Keep these exact words and check this reply before sending anything else."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  const mailto = `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(SUBJECT)}`;
  return (
    <section aria-label={`Reply to ${name}`}><div ref={sectionRef} className={x.ask}>
      {outcome ? <p ref={outcomeRef} tabIndex={-1} role="status" className={x.sentence}>{REPLY_OUTCOME[outcome.status]}</p>
        : <XaSays>{member
          ? <>Write your answer to {first} and I&apos;ll send it{siteName ? ` from ${siteName}` : ""}.</>
          : <>{first} is waiting on your answer. Write it here and I&apos;ll send it{siteName ? ` from ${siteName}` : ""}. A sent reply can&apos;t be undone.</>}</XaSays>}
        <XaTextArea ref={bodyRef} label={`Your reply to ${first}`} rows={5} value={body} maxLength={5000} disabled={saving} readOnly={requestId !== null}
          error={empty && !written ? "Write a reply first." : undefined}
          onChange={(event) => { if (!inFlight.current && !attempt.current) { setBody(event.target.value); setEmpty(false); } }} />
        {bookingOffers ? <InquiryBookingOfferComposer workspaceId={workspaceId} rowId={rowId} disabled={saving || requestId !== null} append={text => { if (inFlight.current || attempt.current) return false; const next = written ? `${body.trimEnd()}\n\n${text}` : `${greeting}${text}`; if (next.length > 5000) return false; setBody(next); return true; }} /> : null}
        {outcome ? null : <div className={x.askRow}>
          <XaButton ref={checkRef} variant="primary" size="lg" busy={saving} disabled={saving} onClick={() => void send()}>{requestId ? "Check this reply" : `Send to ${first}`}</XaButton>
          {!requestId ? <a className={x.linkButton} href={mailto}>Write it myself</a> : null}
          {siteName ? <span className={x.quiet}>Replies go out as {siteName}</span> : null}
        </div>}
        {member ? <p className={x.quiet}>Prices, dates and promises need the owner’s approval.</p> : null}
      {error ? <p role="alert" className={x.sentence} data-tone="waits">{error}</p> : null}
    </div></section>
  );
}
