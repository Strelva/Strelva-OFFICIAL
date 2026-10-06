"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

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

export function ReviewReplyForm({ workspaceId, tenantId, reviewId, author, initial, postsToGoogle }: {
  workspaceId: string;
  tenantId: string;
  reviewId: string;
  author: string;
  initial: string;
  postsToGoogle: boolean;
}) {
  const [text, setText] = useState(initial);
  const [outcome, setOutcome] = useState<ReplyOutcome>({ kind: "idle" });

  if (outcome.kind === "done") {
    return (
      <div className="mt-4 rounded-lg border border-gray-border p-3" role="status">
        <p className="text-xs font-medium text-gray-muted">{outcome.published ? "Posted on Google" : "Your reply, saved. Copy it into the review site to post it."}</p>
        <p className="mt-1 whitespace-pre-line text-sm leading-6">{outcome.reply}</p>
      </div>
    );
  }

  async function send() {
    const reply = text.trim();
    if (!reply) return;
    setOutcome({ kind: "sending" });
    try {
      const response = await fetch("/api/workspace/reviews/reply", {
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

  const id = `reply-${reviewId}`;
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-xs font-medium text-gray-muted">Your reply to {author}</label>
      <textarea id={id} value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={4000}
        className="mt-1 w-full rounded-lg border border-gray-border bg-surface px-3 py-2 text-sm leading-6 focus-visible:outline focus-visible:outline-2" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!text.trim() || outcome.kind === "sending"} onClick={() => void send()}>
          {outcome.kind === "sending" ? "Sending…" : postsToGoogle ? "Reply on Google" : "Save reply"}
        </Button>
        {outcome.kind === "error" ? <p role="alert" className="text-sm text-critical">{outcome.message}</p> : null}
      </div>
    </div>
  );
}
