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

  async function handleAction(action: "approve" | "reject") {
    setLoading(action);
    try {
      const res = await fetch("/api/admin/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, section, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Action failed");
        return;
      }
      router.refresh();
    } catch {
      alert("Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <button
        onClick={() => handleAction("approve")}
        disabled={loading !== null}
        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
      >
        {loading === "approve" ? "Approving..." : "Approve"}
      </button>
      <button
        onClick={() => handleAction("reject")}
        disabled={loading !== null}
        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors disabled:opacity-50"
      >
        {loading === "reject" ? "Rejecting..." : "Reject"}
      </button>
    </div>
  );
}
