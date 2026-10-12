"use client";

import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { StNotice, StPill, StSection, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { TextArea } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import styles from "./website-panels.module.css";

/**
 * "Ask for a change" on a managed website's System page: files a Request to
 * Strelva (a service request, POST /api/workspace/site-changes `ask`) instead
 * of only prefilling the composer. Filing changes nothing on the site; the
 * Request starts at Asked, and nothing is accepted until scope and timing are
 * agreed. A failure keeps the words.
 */
export function WebsiteChangeAsk({ workspaceId, systemId, siteName, onFiled, onClose }: {
  workspaceId: string;
  systemId: string;
  siteName: string;
  onFiled: (requestId: string) => void;
  onClose: () => void;
}) {
  const request = useWorkspaceRequest();
  const [words, setWords] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "status" | "alert"; text: string } | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function file(event: FormEvent) {
    event.preventDefault();
    const text = words.trim();
    if (inFlight.current || (!attempt.current && text.length < 3)) return;
    inFlight.current = true;
    const checking = attempt.current !== null;
    const payload = attempt.current ?? JSON.stringify({ action: "ask", workspaceId, systemId, request: text, idempotencyKey: `site-change:${crypto.randomUUID()}` });
    attempt.current = payload;
    setSending(true);
    setNotice(null);
    try {
      const response = await request("/api/workspace/site-changes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
      });
      const body: unknown = await response.json().catch(() => null);
      const filed = z.object({ requestId: z.string().uuid() }).safeParse(body);
      const error = z.object({ error: z.string() }).safeParse(body);
      if (!response.ok || !filed.success) {
        // These initial route refusals precede ServiceRequestService.execute.
        // A later refusal cannot settle an earlier unknown attempt. In particular,
        // 403/409/5xx can come from the request-list read after filing succeeded.
        const refusedBeforeFiling = !checking && [400, 401, 404, 429].includes(response.status);
        if (refusedBeforeFiling) {
          attempt.current = null;
          setUnconfirmed(false);
          setNotice({ tone: "alert", text: `${error.success ? error.data.error : "That request was refused."} Your words are still here; correct the problem before filing again.` });
        } else {
          setUnconfirmed(true);
          setNotice({ tone: "alert", text: `The request couldn't be confirmed. It may have been filed. ${error.success ? `${error.data.error} ` : ""}Your words are preserved. Check this same request or reload this System to inspect Requests before filing another change.` });
        }
        return;
      }
      attempt.current = null;
      setUnconfirmed(false);
      setWords("");
      setNotice({ tone: "status", text: "Filed for your agency. It's at Asked; they agree scope and timing with you next. Nothing on the site changed." });
      onFiled(filed.data.requestId);
    } catch {
      setUnconfirmed(true);
      setNotice({ tone: "alert", text: "The request couldn't be confirmed. It may have been filed. Your words are preserved. Check this same request or reload this System to inspect Requests before filing another change." });
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return <StSection id={`${systemId}-ask`} title="Ask for a change">
    <p className={styles.description}>Tell Strelva what should change on {siteName}. It becomes a Request you can follow below.</p>
    <StSurface label="Website change request"><form className={styles.form} onSubmit={file}>
      <TextArea label="What should change?" value={words} maxLength={3000} rows={4}
        disabled={sending || unconfirmed} onChange={event => { if (!inFlight.current && !attempt.current) setWords(event.target.value); }} placeholder="New office hours in the footer, starting Monday." />
      <div className={styles.actions}>
        <StPill type="submit" disabled={sending || (!unconfirmed && words.trim().length < 3)}>{sending ? (unconfirmed ? "Checking…" : "Filing…") : unconfirmed ? "Check this request" : "File the request"}</StPill>
        <StTextButton disabled={sending || unconfirmed} onClick={() => { if (!inFlight.current && !attempt.current) onClose(); }}>Close</StTextButton>
      </div>
      {notice ? <StNotice tone={notice.tone === "alert" ? "critical" : undefined}><span role={notice.tone}>{notice.text}</span></StNotice> : null}
    </form></StSurface>
  </StSection>;
}
