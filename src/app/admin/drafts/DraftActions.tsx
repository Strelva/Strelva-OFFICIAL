"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QueueEventDetail } from "@/components/dashboard/QueueEventDetail";
import type { QueueEventLike } from "@/components/dashboard/QueueEventDetail";

export function DraftActions({
  tenant,
  section,
  preview,
}: {
  tenant: string;
  section: string;
  /** Minimal event shape used to render the draft preview above the action
   *  buttons (the exact content / diff that will go live on approval). */
  preview?: QueueEventLike;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Two-step confirm for Reject — first click arms it, second fires.
  const [confirmReject, setConfirmReject] = useState(false);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rejectTimerRef.current !== null) clearTimeout(rejectTimerRef.current);
    };
  }, []);

  function handleRejectClick() {
    if (!confirmReject) {
      setConfirmReject(true);
      rejectTimerRef.current = setTimeout(() => setConfirmReject(false), 4000);
      return;
    }
    if (rejectTimerRef.current !== null) {
      clearTimeout(rejectTimerRef.current);
      rejectTimerRef.current = null;
    }
    setConfirmReject(false);
    void handleAction("reject");
  }

  async function handleAction(action: "approve" | "reject") {
    setConfirmReject(false);
    setLoading(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, section, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Action failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {preview && (
        <QueueEventDetail event={preview} className="" />
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleAction("approve")}
          disabled={loading !== null}
          className="flex-1 min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium bg-positive hover:bg-positive0 text-white transition-colors disabled:opacity-50"
        >
          {loading === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          onClick={handleRejectClick}
          disabled={loading !== null}
          className={`flex-1 min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
            confirmReject
              ? "bg-critical0/15 border border-critical0/30 text-critical hover:bg-critical0/25"
              : "bg-gray-bg hover:bg-gray-bg-hover text-gray-muted hover:text-warm-white"
          }`}
        >
          {loading === "reject" ? "Rejecting…" : confirmReject ? "Confirm reject?" : "Reject"}
        </button>
      </div>
      {error && <p role="status" aria-live="polite" className="text-[11px] text-critical">{error}</p>}
    </div>
  );
}
