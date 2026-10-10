"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StNotice, StPill, StTextButton } from "@/components/ui/strelva/Kit";
import { DraftChangePreview } from "./DraftChangePreview";
import type { QueueEventLike } from "@/components/dashboard/QueueEventDetail";

export function DraftActions({
  tenant,
  section,
  preview,
  readOnly = false,
}: {
  tenant: string;
  section: string;
  /** Minimal event shape used to render the draft preview above the action
   *  buttons (the exact content / diff that will go live on approval). */
  preview?: QueueEventLike;
  readOnly?: boolean;
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
    if (readOnly) return;
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

  return <div className="flex w-full flex-col gap-4 pt-4">
    <DraftChangePreview event={preview} />
    <div className="flex flex-wrap items-center gap-4">
      <StPill variant="soft" onClick={() => void handleAction("approve")} disabled={readOnly || loading !== null} busy={loading === "approve"}>{loading === "approve" ? "Approving…" : "Approve"}</StPill>
      <StTextButton tone="danger" onClick={handleRejectClick} disabled={readOnly || loading !== null}>{loading === "reject" ? "Rejecting…" : confirmReject ? "Confirm reject?" : "Reject"}</StTextButton>
    </div>
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </div>;
}
