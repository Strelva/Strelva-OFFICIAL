"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Check in, undo, or cancel one booking. Plain POST to /api/workspace/bookings,
 * then a server refresh so the list shows what the store now holds. Cancelling
 * asks once before it acts.
 */
export function BookingActions({ workspaceId, tenantId, bookingId, status, clientName, view }: {
  workspaceId: string;
  tenantId: string;
  bookingId: string;
  status: string;
  clientName: string;
  view: "day" | "week";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: "completed" | "confirmed" | "cancelled") {
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
      router.refresh();
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  // A request is the owner's call, made in Needs you, not here.
  if (status === "cancelled" || status === "requested") return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {view === "day" && status === "confirmed" ? (
        <Button size="sm" variant="secondary" loading={busy === "completed"} disabled={Boolean(busy)} onClick={() => change("completed")}>
          Check in
        </Button>
      ) : null}
      {view === "day" && status === "completed" ? (
        <Button size="sm" variant="ghost" loading={busy === "confirmed"} disabled={Boolean(busy)} onClick={() => change("confirmed")}>
          Undo check-in
        </Button>
      ) : null}
      {status === "confirmed" ? (
        confirming ? (
          <>
            <span className="text-sm text-gray-muted">Cancel {clientName}&apos;s booking?</span>
            <Button size="sm" variant="danger" loading={busy === "cancelled"} disabled={Boolean(busy)} onClick={() => change("cancelled")}>Cancel booking</Button>
            <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => setConfirming(false)}>Keep it</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => setConfirming(true)}>Cancel</Button>
        )
      ) : null}
      {error ? <p role="alert" className="w-full text-right text-sm text-critical">{error}</p> : null}
    </div>
  );
}
