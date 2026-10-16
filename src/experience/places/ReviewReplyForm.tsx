"use client";

import { useState } from "react";
import { XaButton, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaNote } from "./XaPlace";
import styles from "./xa-place.module.css";

/**
 * Reply to one review from the workspace. Posts to
 * /api/workspace/reviews/reply, which checks membership and tenant access and
 * then takes the same governed path as /dashboard/reviews: published on
 * Google when the listing is connected, saved to copy by hand otherwise.
 *
 * XA (lane xs-leads): a drafted reply reads as words already written (moss
 * tint), Edit opens it in place, and the one ink pill says where it goes.
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

export function ReviewReplyForm({ workspaceId, tenantId, reviewId, author, initial, postsToGoogle, readOnly = false, primary = true, request = fetch, sentAs }: {
  workspaceId: string;
  tenantId: string;
  reviewId: string;
  author: string;
  initial: string;
  postsToGoogle: boolean;
  readOnly?: boolean;
  primary?: boolean;
  request?: typeof fetch;
  /** Who the reply appears from, e.g. the business name. */
  sentAs?: string;
}) {
  const [text, setText] = useState(initial);
  const [outcome, setOutcome] = useState<ReplyOutcome>({ kind: "idle" });
  const [editing, setEditing] = useState(!initial);

  if (outcome.kind === "done") {
    return <div className={styles.stack} role="status">
      <p className={styles.said}>{outcome.reply}</p>
      <XaNote pebble>{outcome.published ? `Posted on Google. ${author} sees it under their review.` : "Your reply is saved. Copy it into the review site to post it."}</XaNote>
    </div>;
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

  return <div className={styles.stack}>
    {editing
      ? <XaTextArea label={`Your reply to ${author}`} value={text} disabled={readOnly || outcome.kind === "sending"} onChange={event => setText(event.target.value)} rows={4} maxLength={4000} />
      : <><p className={styles.quiet}>{initial ? "Reply drafted, not posted" : "Your reply, not posted"}</p><p className={styles.said}>{text}</p></>}
    {readOnly ? <p className={styles.quiet}>Only an authorized owner can post this reply.</p> : <div className={styles.detailFoot}>
      <XaButton variant={primary ? "primary" : "secondary"} title={postsToGoogle ? "Reply on Google" : "Save reply"} busy={outcome.kind === "sending"} disabled={!text.trim()} onClick={() => void send()}>
        {outcome.kind === "sending" ? "Sending…" : postsToGoogle ? "Post reply" : "Save reply"}
      </XaButton>
      <XaTextLink onClick={() => setEditing(!editing)}>{editing ? "Preview reply" : "Edit"}</XaTextLink>
      <span className={styles.detailFootNote}>{postsToGoogle ? `Posts on Google${sentAs ? ` as ${sentAs}` : ""}` : "Saved here to copy by hand"}</span>
    </div>}
    {outcome.kind === "error" ? <XaNote tone="trouble" pebble role="alert">{outcome.message}</XaNote> : null}
  </div>;
}
