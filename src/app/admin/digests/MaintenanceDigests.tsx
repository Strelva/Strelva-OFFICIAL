"use client";

import { useState } from "react";
import { Check, X, FileText, Activity } from "lucide-react";
import type { MaintenanceDigest } from "@/lib/maintenance-digest";

export function MaintenanceDigests({ initialDigests }: { initialDigests: MaintenanceDigest[] }) {
  const [digests, setDigests] = useState(initialDigests);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function decide(tenant: string, decision: "approved" | "dismissed") {
    setBusy(tenant);
    setError("");
    try {
      const res = await fetch("/api/admin/maintenance-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ tenant, decision }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || "Couldn't record that.");
        return;
      }
      // Optimistically drop the decided digest from the pending list.
      setDigests((cur) => cur.filter((d) => d.tenant !== tenant));
    } catch {
      setError("Couldn't record that. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  if (digests.length === 0) {
    return (
      <div className="rounded-xl border border-glass-border bg-surface-raised p-8 text-center">
        <p className="text-[14px] font-medium text-warm-white">Nothing needs review</p>
        <p className="mt-1 text-[13px] text-gray-muted">
          Every site is current, or this week&apos;s digests haven&apos;t generated yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-[13px] text-red-400">{error}</p>}
      {digests.map((d) => (
        <div key={d.tenant} className="rounded-xl border border-glass-border bg-surface-raised p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-warm-white">{d.siteName || d.tenant}</p>
              <p className="text-[12px] text-gray-muted">
                {d.items.length} item{d.items.length === 1 ? "" : "s"} · week of {d.weekOf}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => decide(d.tenant, "approved")}
                disabled={busy === d.tenant}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Approve
              </button>
              <button
                type="button"
                onClick={() => decide(d.tenant, "dismissed")}
                disabled={busy === d.tenant}
                className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border px-3 py-1.5 text-[12px] font-medium text-gray-muted transition-colors hover:text-warm-white disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                Dismiss
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            {d.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5 rounded-lg bg-glass px-3 py-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-dim text-accent">
                  {item.type === "health" ? (
                    <Activity className="h-3.5 w-3.5" strokeWidth={1.7} />
                  ) : (
                    <FileText className="h-3.5 w-3.5" strokeWidth={1.7} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-warm-white">{item.title}</p>
                  <p className="text-[12px] leading-relaxed text-gray-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
