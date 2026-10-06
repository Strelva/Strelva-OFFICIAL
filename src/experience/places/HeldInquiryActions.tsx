"use client";

import { useState } from "react";
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
  return body?.error ? body.error : "That didn't go through. Nothing changed.";
}

const DONE: Record<HeldDecision, string> = {
  release: "Released. It's with your other inquiries now; nobody was emailed.",
  confirm_spam: "Marked as spam. It stays on record and out of your inbox.",
  hold: "Moved back to held messages.",
};

export function HeldInquiryActions({ workspaceId, rowId, name, mode }: { workspaceId: string; rowId: string; name: string; mode: "held" | "released" }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  if (outcome.kind === "done") return <p role="status" className="mt-3 text-sm text-gray-muted">{DONE[outcome.decision]}</p>;

  async function decide(decision: HeldDecision) {
    setOutcome({ kind: "saving", decision });
    try {
      const response = await fetch("/api/workspace/inquiries/held", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ workspaceId, rowId, decision }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) setOutcome({ kind: "error", message: heldErrorMessage(response.status, body) });
      else setOutcome({ kind: "done", decision });
    } catch {
      setOutcome({ kind: "error", message: "That didn't go through. Nothing changed." });
    }
  }

  const saving = outcome.kind === "saving";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {mode === "held" ? (
        <>
          <Button size="sm" disabled={saving} onClick={() => void decide("release")} aria-label={`Release the message from ${name}`}>
            {saving && outcome.decision === "release" ? "Releasing…" : "Not spam, release it"}
          </Button>
          <Button size="sm" variant="secondary" disabled={saving} onClick={() => void decide("confirm_spam")} aria-label={`Confirm the message from ${name} is spam`}>
            {saving && outcome.decision === "confirm_spam" ? "Saving…" : "It's spam"}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => void decide("hold")} aria-label={`Move the message from ${name} back to held`}>
          {saving ? "Moving…" : "Move back to held"}
        </Button>
      )}
      {outcome.kind === "error" ? <p role="alert" className="text-sm text-critical">{outcome.message}</p> : null}
    </div>
  );
}
