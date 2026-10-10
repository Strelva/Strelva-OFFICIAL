"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StHold, StPill } from "@/components/ui/strelva/Kit";

/**
 * Check in, undo, or cancel one booking. Plain POST to /api/workspace/bookings,
 * then a server refresh so the list shows what the store now holds. Cancelling
 * asks once before it acts.
 */
export function BookingActions({ workspaceId, tenantId, bookingId, status, clientName, view, canMarkNoShow }: {
  workspaceId: string;
  tenantId: string;
  bookingId: string;
  status: string;
  clientName: string;
  view: "day" | "week";
  canMarkNoShow?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [noShowConfirming, setNoShowConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: "completed" | "confirmed" | "cancelled" | "no_show") {
    setBusy(next);
    setError(null);
    try {
      const res = await fetch("/api/workspace/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, tenantId, bookingId, status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "That didn't save. Try again.");
        return;
      }
      setConfirming(false);
      setNoShowConfirming(false);
      router.refresh();
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  // A request is the owner's call, made in Needs you, not here.
  if (["cancelled", "requested", "declined", "held", "no_show"].includes(status)) return null;
  // The week view only cancels; a checked-in booking there has nothing to do.
  if (status === "completed" && view !== "day") return null;
  return (
    <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
      {view === "day" && status === "confirmed" ? (
        <StPill variant="soft" busy={busy === "completed"} disabled={Boolean(busy)} onClick={() => change("completed")}>
          Check in
        </StPill>
      ) : null}
      {view === "day" && status === "completed" ? (
        <StPill variant="soft" busy={busy === "confirmed"} disabled={Boolean(busy)} onClick={() => change("confirmed")}>
          Undo check-in
        </StPill>
      ) : null}
      {status === "confirmed" && canMarkNoShow ? (
        noShowConfirming ? <>
          <span className="text-sm text-gray-muted">Mark {clientName} as a no-show?</span>
          <StHold label={busy === "no_show" ? "Saving…" : "Hold to confirm no-show"} disabled={Boolean(busy)} onAccept={() => void change("no_show")} />
          <StPill variant="soft" disabled={Boolean(busy)} onClick={() => setNoShowConfirming(false)}>Keep booked</StPill>
        </> : <StPill variant="soft" disabled={Boolean(busy)} onClick={() => { setNoShowConfirming(true); setConfirming(false); }}>Mark no-show</StPill>
      ) : null}
      {status === "confirmed" && !noShowConfirming ? (
        confirming ? (
          <>
            <span className="text-sm text-gray-muted">Cancel {clientName}&apos;s booking?</span>
            <StHold label={busy === "cancelled" ? "Cancelling…" : "Hold to cancel booking"} disabled={Boolean(busy)} onAccept={() => void change("cancelled")} />
            <StPill variant="soft" disabled={Boolean(busy)} onClick={() => setConfirming(false)}>Keep it</StPill>
          </>
        ) : (
          <StPill variant="soft" disabled={Boolean(busy)} onClick={() => { setConfirming(true); setNoShowConfirming(false); }}>Cancel</StPill>
        )
      ) : null}
      {error ? <p role="alert" className="w-full text-sm text-critical sm:text-right">{error}</p> : null}
    </div>
  );
}
