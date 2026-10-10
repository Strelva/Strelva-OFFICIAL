"use client";

import { useState } from "react";
import { TextArea } from "@/components/ui/TextInput";
import { StLabel, StNotice, StPill, StState, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "@/experience/publishing/publishing.module.css";

/**
 * Reply to one review from the workspace. Posts to
 * /api/workspace/reviews/reply, which checks membership and tenant access and
 * then takes the same governed path as /dashboard/reviews: published on
 * Google when the listing is connected, saved to copy by hand otherwise.
 */

export type ReplyOutcome =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; reply: string; published: boolean }
  | { kind: "error"; message: string };

export function replyErrorMessage(status: number, body: { error?: string } | null): string {
  if (status === 401) return "Sign in again to reply. Nothing was posted.";
  if (status === 403) return "Your account can't reply for this business. Nothing was posted.";
  if (status === 404) return "This review is no longer here. Nothing was posted.";
  if (status === 429) return "Please wait a moment before replying again.";
  if (status === 502) return "Google didn't accept the reply. Nothing was posted. Try again in a minute.";
  return body?.error ? `${body.error} Nothing was posted.` : "The reply didn't go through. Nothing was posted.";
}

export function ReviewReplyForm({ workspaceId, tenantId, reviewId, author, initial, postsToGoogle, readOnly = false, primary = true, request = fetch }: {
  workspaceId: string;
  tenantId: string;
  reviewId: string;
  author: string;
  initial: string;
  postsToGoogle: boolean;
  readOnly?: boolean;
  primary?: boolean;
  request?: typeof fetch;
}) {
  const [text, setText] = useState(initial);
  const [outcome, setOutcome] = useState<ReplyOutcome>({ kind: "idle" });
  const [editing, setEditing] = useState(!initial);

  if (outcome.kind === "done") {
    return (
      <div className={styles.draft} role="status"><StNotice><div className={styles.stack}>
        <StLabel>{outcome.published ? "Posted on Google" : "Your reply, saved. Copy it into the review site to post it."}</StLabel>
        <p className={styles.copy}>{outcome.reply}</p>
      </div></StNotice></div>
    );
  }

  async function send() {
    const reply = text.trim();
    if (!reply || readOnly || outcome.kind === "sending") return;
    setOutcome({ kind: "sending" });
    try {
      const response = await request("/api/workspace/reviews/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ workspaceId, tenantId, reviewId, reply }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; published?: boolean; review?: { reply?: string } } | null;
      if (!response.ok) setOutcome({ kind: "error", message: replyErrorMessage(response.status, body) });
      else setOutcome({ kind: "done", reply: body?.review?.reply ?? reply, published: body?.published === true });
    } catch {
      setOutcome({ kind: "error", message: "The reply couldn't be sent. Nothing was posted." });
    }
  }

  return (
    <div className={styles.draft}><StNotice><div className={styles.stack}>
      <StState kind={initial ? "need" : "draft"}>{initial ? "Reply drafted · not posted" : "Your reply · not posted"}</StState>
      {editing ? <TextArea label={`Your reply to ${author}`} value={text} disabled={readOnly || outcome.kind === "sending"} onChange={event => setText(event.target.value)} rows={3} maxLength={4000} /> : <p className={styles.copy}>{text}</p>}
      {readOnly ? <p className={styles.copy}>Only an authorized owner can post this reply.</p> : <div className={styles.actions}>
        <StTextButton disabled={outcome.kind === "sending"} onClick={() => setEditing(!editing)}>{editing ? "Preview reply" : "Edit"}</StTextButton>
        <StPill variant={primary ? "primary" : "soft"} title={postsToGoogle ? "Reply on Google" : "Save reply"} busy={outcome.kind === "sending"} disabled={!text.trim()} onClick={() => void send()}>
          {outcome.kind === "sending" ? "Sending…" : postsToGoogle ? "Post reply" : "Save reply"}
        </StPill>
      </div>}
      {outcome.kind === "error" ? <StNotice tone="critical">{outcome.message}</StNotice> : null}
    </div></StNotice></div>
  );
}
