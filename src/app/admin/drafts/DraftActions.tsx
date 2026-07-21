"use client";

import { useState } from "react";
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

  async function handleAction(action: "approve" | "reject") {
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
          onClick={() => handleAction("reject")}
          disabled={loading !== null}
          className="flex-1 min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium bg-gray-bg hover:bg-gray-bg-hover text-gray-muted hover:text-warm-white transition-colors disabled:opacity-50"
        >
          {loading === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && <p role="status" aria-live="polite" className="text-[11px] text-critical">{error}</p>}
    </div>
  );
}
