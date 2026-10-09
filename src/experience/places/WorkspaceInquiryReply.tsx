"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { beginFocusRecovery, type FocusRecovery } from "@/experience/websites/focus-recovery";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/TextInput";
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

export function WorkspaceInquiryReply({ workspaceId, rowId, name, email, bookingOffers = false, member = false }: { workspaceId: string; rowId: string; name: string; email: string; bookingOffers?: boolean; member?: boolean }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("Re: Your inquiry");
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<WorkspaceReplyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
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
    focusRecovery.current.recover(outcome ? outcomeRef.current : requestId ? checkRef.current : subjectRef.current, true);
    focusRecovery.current = null;
  }, [error, outcome, requestId, saving]);
  useEffect(() => {
    if (open && !wasOpen.current) subjectRef.current?.focus();
    else if (!open && wasOpen.current) openerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (!open) return <Button className="max-w-full whitespace-normal break-words" ref={openerRef} size="md" variant="secondary" onClick={() => setOpen(true)}>Reply to {name}</Button>;
  async function send() {
    if (inFlight.current || settled.current || (!attempt.current && (!subject.trim() || !body.trim()))) return;
    inFlight.current = true;
    const checking = attempt.current !== null;
    const current = attempt.current ?? { id: crypto.randomUUID(), payload: "" };
    if (!checking) current.payload = JSON.stringify({ workspaceId, rowId, requestId: current.id, subject, body });
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
          setError(refusal.success ? refusal.data.error : "The reply was refused before sending. Your draft is still here.");
        } else setError(`The reply couldn't be confirmed. Keep this exact draft and check this reply before sending anything else.${refusal.success && !/\bnothing (?:was )?(?:sent|changed)\b/i.test(refusal.data.error) ? ` ${refusal.data.error}` : ""}`);
      } else { settled.current = true; setOutcome(parsed.data.outcome); }
    } catch { setError("The reply couldn't be confirmed. Keep this exact draft and check this reply before sending anything else."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return (
    <div ref={sectionRef} className="mt-4 grid min-w-0 gap-4">
      <p className="text-sm break-all">To {email}</p>
      <TextInput className="min-w-0" ref={subjectRef} label="Subject" value={subject} onChange={(event) => { if (!inFlight.current && !attempt.current) setSubject(event.target.value); }} maxLength={200} disabled={saving || requestId !== null} />
      <TextArea className="min-w-0" label={`Your reply to ${name}`} value={body} onChange={(event) => { if (!inFlight.current && !attempt.current) setBody(event.target.value); }} maxLength={5000} disabled={saving || requestId !== null} />
      {bookingOffers ? <InquiryBookingOfferComposer workspaceId={workspaceId} rowId={rowId} disabled={saving || requestId !== null} append={text => { if (inFlight.current || attempt.current) return false; const next = body ? `${body}\n\n${text}` : text; if (next.length > 5000) return false; setBody(next); return true; }} /> : null}
      <p className="text-xs text-gray-muted">{member ? "You can send an ordinary reply for inquiries assigned or routed to you. Prices, dates and promises need the owner’s approval. A sent reply cannot be undone." : "Sending approves this exact message, including any price, date or promise. A sent reply cannot be undone."}</p>
      {outcome ? <p ref={outcomeRef} tabIndex={-1} role="status" className="text-sm">{REPLY_OUTCOME[outcome.status]}</p> : (
        <div className="flex flex-wrap gap-3">
          <Button className="max-w-full whitespace-normal break-words" ref={checkRef} loading={saving} disabled={saving || (!requestId && (!subject.trim() || !body.trim()))} onClick={() => void send()}>{requestId ? "Check this reply" : member ? "Send reply" : "Approve and send reply"}</Button>
          {!requestId ? <Button className="max-w-full whitespace-normal break-words" variant="ghost" disabled={saving} onClick={() => { if (!inFlight.current && !attempt.current) setOpen(false); }}>Close draft</Button> : null}
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
      {outcome?.providerMessageId ? <p className="text-xs text-gray-muted break-all">Provider receipt: {outcome.providerMessageId}</p> : null}
    </div>
  );
}
