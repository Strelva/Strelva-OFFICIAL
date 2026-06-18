"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DraftActions({
  tenant,
  section,
}: {
  tenant: string;
  section: string;
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
    <div className="flex flex-col items-end gap-2 shrink-0">
      <button
        onClick={() => handleAction("approve")}
        disabled={loading !== null}
        className="w-28 px-4 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
      >
        {loading === "approve" ? "Approving…" : "Approve"}
      </button>
      <button
        onClick={() => handleAction("reject")}
        disabled={loading !== null}
        className="w-28 px-4 py-1.5 rounded-md text-xs font-medium bg-gray-bg hover:bg-gray-bg-hover text-gray-muted hover:text-warm-white transition-colors disabled:opacity-50"
      >
        {loading === "reject" ? "Rejecting…" : "Reject"}
      </button>
      {error && <p role="status" aria-live="polite" className="text-[11px] text-red-300 max-w-28 text-right">{error}</p>}
    </div>
  );
}
