"use client";

import { useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    if (open && !wasOpen.current) subjectRef.current?.focus();
    else if (!open && wasOpen.current) openerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (!open) return <Button ref={openerRef} size="md" variant="secondary" onClick={() => setOpen(true)}>Reply to {name}</Button>;
  async function send() {
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id); setSaving(true); setError(null);
    try {
      const response = await fetch("/api/workspace/inquiries/reply", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, rowId, requestId: id, subject, body }),
      });
      const result = await response.json().catch(() => null) as { outcome?: WorkspaceReplyOutcome; error?: string } | null;
      if (!response.ok || !result?.outcome || !Object.hasOwn(REPLY_OUTCOME, result.outcome.status)) {
        setError(result?.error ?? "The reply couldn't be confirmed. Keep this draft and check before trying again.");
        // These explicit refusals happen before a send claim. Keep the draft editable.
        if ([400, 403, 404, 409].includes(response.status)) setRequestId(null);
      } else setOutcome(result.outcome);
    } catch { setError("The reply couldn't be confirmed. Keep this draft and check before trying again."); }
    finally { setSaving(false); }
  }
  return (
    <div className="mt-4 grid gap-4">
      <p className="text-sm break-all">To {email}</p>
      <TextInput ref={subjectRef} label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} disabled={saving || requestId !== null} />
      <TextArea label={`Your reply to ${name}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} disabled={saving || requestId !== null} />
      {bookingOffers ? <InquiryBookingOfferComposer workspaceId={workspaceId} rowId={rowId} disabled={saving || requestId !== null} append={text => { const next = body ? `${body}\n\n${text}` : text; if (next.length > 5000) return false; setBody(next); return true; }} /> : null}
      <p className="text-xs text-gray-muted">{member ? "You can send an ordinary reply for inquiries assigned or routed to you. Prices, dates and promises need the owner’s approval. A sent reply cannot be undone." : "Sending approves this exact message, including any price, date or promise. A sent reply cannot be undone."}</p>
      {outcome ? <p role="status" className="text-sm">{REPLY_OUTCOME[outcome.status]}</p> : (
        <div className="flex flex-wrap gap-3">
          <Button loading={saving} disabled={!subject.trim() || !body.trim()} onClick={() => void send()}>{requestId ? "Check this reply" : member ? "Send reply" : "Approve and send reply"}</Button>
          {!requestId ? <Button variant="ghost" onClick={() => setOpen(false)}>Close draft</Button> : null}
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
      {outcome?.providerMessageId ? <p className="text-xs text-gray-muted break-all">Provider receipt: {outcome.providerMessageId}</p> : null}
    </div>
  );
}
