"use client";

import { useState } from "react";
import {
  XaButton,
  XaHeadline,
  XaSays,
  XaTextLink,
  XaUndo,
  XaUndoDock,
} from "@/components/ui/strelva/Xa";
import { strelvaUndoWindowMs } from "@/platform/infra/motion";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import styles from "@/experience/workspace/money/money.module.css";

type Transport = (input: string, init?: RequestInit) => Promise<Response>;

export interface PlanWaitlistProps {
  workspaceId: string;
  businessName: string;
  /** The confirmed email the note goes to, when this business is already on the list. */
  joinedEmail?: string | null;
  /** True when the business has no included Strelva work, so asks pause until plans open. */
  noIncludedWork?: boolean;
  /** Where "Bring in an agency" goes. */
  agencyHref: string;
  /** The full billing section with its headline, or just the action inside Ask or getting started. */
  variant?: "page" | "inline";
  /** False when another decision on the screen holds the one ink pill. */
  primary?: boolean;
  /** Only an owner or admin can ask; everyone else reads why. */
  canJoin?: boolean;
  transport?: Transport;
}

/**
 * The honest "not yet" for a business with no plan (October 16 money
 * decision). No price is shown and nothing opens checkout: Strelva says plans
 * aren't open, what that means for this business today, and offers one thing
 * to do about it. Joining saves the owner's confirmed email; nothing is sent
 * until plans open. Undo takes the business back off the list.
 */
export function PlanWaitlist({
  workspaceId,
  businessName,
  joinedEmail = null,
  noIncludedWork = true,
  agencyHref,
  variant = "page",
  primary = true,
  canJoin = true,
  transport: given,
}: PlanWaitlistProps) {
  // The page's request path: fetch in production, fixtures in previews.
  const contextual = useWorkspaceRequest();
  const transport = given ?? contextual;
  const [email, setEmail] = useState<string | null>(joinedEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<"joined" | "left" | null>(null);

  async function send(action: "join" | "leave") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await transport("/api/workspace/plan-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, action }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        joined?: boolean;
        email?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "That didn’t go through. Nothing changed.");
      if (action === "join") {
        setEmail(body.email ?? "your email");
        setToast("joined");
      } else {
        setEmail(null);
        setToast("left");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That didn’t go through. Nothing changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  // The headline's quiet line already says the website keeps running; Pebble says only what changes.
  const situation = noIncludedWork
    ? `Until plans open, Strelva can’t take on new work for ${businessName}.`
    : `${businessName} has a little Strelva work each month while plans are closed.`;

  const body = email ? (
    <div className={styles.section} aria-live="polite">
      {/* No sender exists yet (October 16): say what really happens, never promise an email. */}
      <p className={styles.body}>
        You’re on the list. Nothing is sent or charged until plans open.{" "}
        <XaTextLink onClick={busy ? undefined : () => void send("leave")}>
          Take {businessName} off the list
        </XaTextLink>
      </p>
    </div>
  ) : canJoin ? (
    <div className={styles.actions}>
      <XaButton
        variant={primary ? "primary" : "secondary"}
        busy={busy}
        disabled={busy}
        onClick={() => void send("join")}
      >
        Put {businessName} on the list
      </XaButton>
      <XaTextLink href={agencyHref}>Bring in an agency instead</XaTextLink>
    </div>
  ) : (
    <p className={styles.note}>
      The business owner can put {businessName} on the list for plans.{" "}
      <XaTextLink href={agencyHref}>Bring in an agency</XaTextLink>
    </p>
  );

  // Joining and leaving are both live acts, so each gets its Undo: the other one.
  const toastLine =
    toast === "joined" ? (
      <XaUndoDock>
        <XaUndo
          key="joined"
          onUndo={() => {
            setToast(null);
            void send("leave");
          }}
          windowMs={strelvaUndoWindowMs}
          onExpire={() => setToast(null)}
        >
          {businessName} is on the list
        </XaUndo>
      </XaUndoDock>
    ) : toast === "left" ? (
      <XaUndoDock>
        <XaUndo
          key="left"
          onUndo={() => {
            setToast(null);
            void send("join");
          }}
          windowMs={strelvaUndoWindowMs}
          onExpire={() => setToast(null)}
        >
          {businessName} is off the list
        </XaUndo>
      </XaUndoDock>
    ) : null;

  // Inline: the caller already said what's happening (Ask's reply, Pebble on
  // getting started); this adds only the one action, or the joined state.
  if (variant === "inline")
    return (
      <div className={styles.section} data-plan-waitlist>
        {body}
        {error ? (
          <p className={styles.critical} role="alert">
            {error}
          </p>
        ) : null}
        {toastLine}
      </div>
    );

  return (
    <section
      className={styles.section}
      aria-labelledby="plan-heading"
      data-plan-waitlist
    >
      <div className={styles.brief}>
        <XaHeadline
          id="plan-heading"
          quiet="Your website and inquiries keep running."
        >
          Plans aren’t open yet.
        </XaHeadline>
      </div>
      <XaSays>{situation}</XaSays>
      {body}
      {error ? (
        <p className={styles.critical} role="alert">
          {error}
        </p>
      ) : null}
      {toastLine}
    </section>
  );
}
