"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { SystemPanel as Panel } from "./SystemPanel";

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
  const [idempotencyKey, setIdempotencyKey] = useState(() => `site-change:${crypto.randomUUID()}`);

  async function file(event: FormEvent) {
    event.preventDefault();
    const text = words.trim();
    if (text.length < 3 || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const response = await request("/api/workspace/site-changes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", workspaceId, systemId, request: text, idempotencyKey }),
      });
      const body = await response.json().catch(() => null) as { requestId?: string; error?: string } | null;
      if (!response.ok || !body?.requestId) {
        setNotice({ tone: "alert", text: `${body?.error || "That couldn't be filed."} Nothing was sent; your words are still here.` });
        return;
      }
      setWords("");
      setIdempotencyKey(`site-change:${crypto.randomUUID()}`);
      setNotice({ tone: "status", text: "Filed for Strelva. It's at Asked; Strelva agrees scope and timing with you next. Nothing on the site changed." });
      onFiled(body.requestId);
    } catch {
      setNotice({ tone: "alert", text: "That couldn't be filed. Nothing was sent; your words are still here." });
    } finally {
      setSending(false);
    }
  }

  return <Panel id={`${systemId}-ask`} title="Ask for a change" count={0} intro={`Tell Strelva what should change on ${siteName}. It becomes a Request you can follow below.`}>
    <form className="mt-3 grid gap-2" onSubmit={file}>
      <TextArea label="What should change?" value={words} maxLength={3000} rows={4}
        disabled={sending} onChange={event => setWords(event.target.value)} placeholder="New office hours in the footer, starting Monday." />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={sending || words.trim().length < 3}>{sending ? "Filing…" : "File the request"}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={sending} onClick={onClose}>Close</Button>
      </div>
      {notice ? <p role={notice.tone} className="text-sm">{notice.text}</p> : null}
    </form>
  </Panel>;
}
