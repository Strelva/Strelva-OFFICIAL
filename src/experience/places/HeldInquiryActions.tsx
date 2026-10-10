"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { beginFocusRecovery, type FocusRecovery } from "@/experience/websites/focus-recovery";
import { Button } from "@/components/ui/Button";

/**
 * The owner's review of one message held as spam: Release (it becomes a
 * normal inquiry; nobody is emailed) or Confirm spam, and, for a released
 * one, Put back. Posts to /api/workspace/inquiries/held, where the database
 * decides who may act.
 */

export type HeldDecision = "release" | "confirm_spam" | "hold";

type Outcome =
  | { kind: "idle" }
  | { kind: "saving"; decision: HeldDecision }
  | { kind: "done"; decision: HeldDecision }
  | { kind: "error"; message: string };

export function heldErrorMessage(status: number, body: { error?: string } | null): string {
  if (status === 401) return "Sign in again to decide. Nothing changed.";
  if (status === 403) return "Only the business owner can decide on held messages. Nothing changed.";
  if (status === 404) return "This message is no longer here.";
  if (status === 429) return "Please wait a moment and try again.";
  if ([400, 409].includes(status) && body?.error) return body.error;
  return "The decision couldn't be confirmed. Reload these inquiries to inspect its current state before deciding again.";
}

const DONE: Record<HeldDecision, string> = {
  release: "Released. It's with your other inquiries now; nobody was emailed.",
  confirm_spam: "Marked as spam. It stays on record and out of your inbox.",
  hold: "Moved back to held messages.",
};

export function HeldInquiryActions({ workspaceId, rowId, name, mode }: { workspaceId: string; rowId: string; name: string; mode: "held" | "released" }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [unconfirmed, setUnconfirmed] = useState(false);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  const focusRecovery = useRef<FocusRecovery | null>(null);
  useEffect(() => () => focusRecovery.current?.cancel(), []);
  useEffect(() => {
    if (outcome.kind === "saving" || !focusRecovery.current) return;
    focusRecovery.current.recover(outcome.kind === "done" ? statusRef.current : reloadRef.current, unconfirmed || outcome.kind === "done");
    focusRecovery.current = null;
  }, [outcome, unconfirmed]);

  if (outcome.kind === "done") return <p ref={statusRef} tabIndex={-1} role="status" className="mt-3 text-sm text-gray-muted">{DONE[outcome.decision]}</p>;

  async function decide(decision: HeldDecision) {
    if (inFlight.current || blocked.current) return;
    inFlight.current = true;
    focusRecovery.current?.cancel();
    focusRecovery.current = beginFocusRecovery(sectionRef.current);
    setOutcome({ kind: "saving", decision });
    try {
      const response = await fetch("/api/workspace/inquiries/held", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ workspaceId, rowId, decision }),
      });
      const body: unknown = await response.json().catch(() => null);
      const acknowledgement = z.object({ status: z.enum(["decided", "unchanged"]), state: z.literal(decision === "release" ? "released" : decision === "confirm_spam" ? "confirmed_spam" : "held_as_spam") }).safeParse(body);
      if (response.ok && acknowledgement.success) {
        blocked.current = true;
        setOutcome({ kind: "done", decision });
      } else {
        const definitiveRefusal = [400, 401, 403, 404, 409, 429].includes(response.status);
        blocked.current = !definitiveRefusal;
        setUnconfirmed(!definitiveRefusal);
        const error = z.object({ error: z.string() }).safeParse(body);
        setOutcome({ kind: "error", message: heldErrorMessage(response.status, error.success ? error.data : null) });
      }
    } catch {
      blocked.current = true;
      setUnconfirmed(true);
      setOutcome({ kind: "error", message: heldErrorMessage(0, null) });
    } finally { inFlight.current = false; }
  }

  const saving = outcome.kind === "saving";
  return (
    <div ref={sectionRef} className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
      {mode === "held" ? (
        <>
          <Button className="max-w-full whitespace-normal break-words" size="sm" disabled={saving || unconfirmed} onClick={() => void decide("release")} aria-label={`Release the message from ${name}`}>
            {saving && outcome.decision === "release" ? "Releasing…" : "Not spam, release it"}
          </Button>
          <Button className="max-w-full whitespace-normal break-words" size="sm" variant="secondary" disabled={saving || unconfirmed} onClick={() => void decide("confirm_spam")} aria-label={`Confirm the message from ${name} is spam`}>
            {saving && outcome.decision === "confirm_spam" ? "Saving…" : "It's spam"}
          </Button>
        </>
      ) : (
        <Button className="max-w-full whitespace-normal break-words" size="sm" variant="secondary" disabled={saving || unconfirmed} onClick={() => void decide("hold")} aria-label={`Move the message from ${name} back to held`}>
          {saving ? "Moving…" : "Move back to held"}
        </Button>
      )}
      {unconfirmed ? <Button className="max-w-full whitespace-normal break-words" ref={reloadRef} size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload inquiries</Button> : null}
      {outcome.kind === "error" ? <p role="alert" className="text-sm text-critical">{outcome.message}</p> : null}
    </div>
  );
}
