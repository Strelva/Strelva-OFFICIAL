"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StPill } from "@/components/ui/strelva/Kit";
import { XaYes } from "@/components/ui/strelva/Xa";

/**
 * Check in, undo, or cancel one booking. Plain POST to /api/workspace/bookings,
 * then a server refresh so the list shows what the store now holds. A cancel or
 * a no-show has no server Undo, so the one yes (XaYes) asks its question in
 * place first: one click to ask, the pill confirms, Not yet keeps it.
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
        noShowConfirming ? <XaYes state={busy === "no_show" ? "going" : "waiting"} block={false} shortcut={false} question={`Mark ${clientName} as a no-show? This can't be undone here.`}
          yesLabel="Mark no-show" notYetLabel="Keep booked" disabled={Boolean(busy)} working={{ title: "Saving the no-show", steps: [] }}
          onYes={() => void change("no_show")} onNotYet={() => setNoShowConfirming(false)} /> : <StPill variant="soft" disabled={Boolean(busy)} onClick={() => { setNoShowConfirming(true); setConfirming(false); }}>Mark no-show</StPill>
      ) : null}
      {status === "confirmed" && !noShowConfirming ? (
        confirming ? (
          <XaYes state={busy === "cancelled" ? "going" : "waiting"} block={false} shortcut={false} question={`Cancel ${clientName}'s booking? This can't be undone here.`}
            yesLabel="Cancel booking" notYetLabel="Keep it" disabled={Boolean(busy)} working={{ title: "Cancelling the booking", steps: [] }}
            onYes={() => void change("cancelled")} onNotYet={() => setConfirming(false)} />
        ) : (
          <StPill variant="soft" disabled={Boolean(busy)} onClick={() => { setConfirming(true); setNoShowConfirming(false); }}>Cancel</StPill>
        )
      ) : null}
      {error ? <p role="alert" className="w-full text-sm text-critical sm:text-right">{error}</p> : null}
    </div>
  );
}
