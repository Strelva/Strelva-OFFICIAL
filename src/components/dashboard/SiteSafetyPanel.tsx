"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw, Save, ShieldCheck } from "lucide-react";
import type { SiteSnapshotSummary } from "@/lib/storage";
import { useDashboardOptional } from "./DashboardContext";

interface SiteSafetyPanelProps {
  /** Newest-first list of saved versions (up to 60 daily/manual backups). */
  snapshots: SiteSnapshotSummary[];
}

function formatSnapshotDate(value: string | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SiteSafetyPanel({ snapshots: initialSnapshots }: SiteSafetyPanelProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const [snapshots, setSnapshots] = useState<SiteSnapshotSummary[]>(initialSnapshots);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveBackup() {
    setError("");
    setMessage("");
    setConfirmingId(null);
    startTransition(async () => {
      const response = await fetch(dashboardHref("/api/site-snapshots"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "create", label: "Manual backup" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.snapshot) {
        setError(body?.error || "Could not save a backup.");
        return;
      }
      setSnapshots((prev) => [body.snapshot as SiteSnapshotSummary, ...prev]);
      setMessage("Backup saved. You can restore to it if a future change goes wrong.");
    });
  }

  function restore(snapshotId: string) {
    setError("");
    setMessage("");
    setRestoringId(snapshotId);
    startTransition(async () => {
      const response = await fetch(dashboardHref("/api/site-snapshots"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "restore", snapshotId }),
      });
      const body = await response.json().catch(() => null);
      setRestoringId(null);
      setConfirmingId(null);
      if (!response.ok || !body?.restored) {
        setError(body?.error || "Could not restore this version.");
        return;
      }
      const restored = body.restored as SiteSnapshotSummary;
      const preRestore = body.preRestore as SiteSnapshotSummary | undefined;
      // A safety backup from right before the restore was saved server-side —
      // fold it in at the top, and mark the restored version.
      setSnapshots((prev) => {
        const next = prev.map((s) => (s.id === snapshotId ? { ...s, ...restored } : s));
        return preRestore ? [preRestore, ...next] : next;
      });
      setMessage("Site restored. A backup from right before the restore was saved too.");
    });
  }

  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Safety net
          </p>
          <h2 className="mt-2 text-[18px] font-semibold text-warm-black">
            Revert to a last good version
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-gray-muted">
            Every saved version captures your whole site. Roll back to any of them and your live
            site returns to exactly how it looked then.
          </p>
        </div>
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-success" strokeWidth={1.5} />
      </div>

      <button
        type="button"
        onClick={saveBackup}
        disabled={isPending}
        className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-warm-white px-4 text-[13px] font-medium text-on-warm-white transition-colors hover:bg-warm-white/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save className="h-4 w-4" strokeWidth={1.5} />
        Save a version now
      </button>

      {snapshots.length === 0 ? (
        <p className="mt-4 rounded-lg border border-gray-border/70 bg-surface-raised px-3 py-3 text-[13px] leading-relaxed text-gray-muted">
          No saved versions yet. Save one now, and Strelva keeps a daily backup from here on so you
          always have a good version to return to.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {snapshots.map((snapshot) => {
            const confirming = confirmingId === snapshot.id;
            const restoring = restoringId === snapshot.id;
            return (
              <li
                key={snapshot.id}
                className="rounded-xl border border-gray-border/70 bg-surface-raised px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-warm-black">
                      {snapshot.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-gray-muted">
                      {formatSnapshotDate(snapshot.createdAt)}
                      {` · ${snapshot.sections.length} sections`}
                      {snapshot.status === "restored" ? " · restored" : ""}
                    </p>
                  </div>
                  {!confirming ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingId(snapshot.id);
                        setError("");
                        setMessage("");
                      }}
                      disabled={isPending}
                      className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-2 rounded-lg border border-glass-border px-3 text-[12px] font-medium text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Restore this version
                    </button>
                  ) : null}
                </div>

                {confirming ? (
                  <div className="mt-3 rounded-lg border border-accent/25 bg-accent-dim/40 px-3 py-3">
                    <p className="text-[12px] leading-relaxed text-warm-black">
                      This replaces your live site with this version. Your current site is backed up
                      first, so you can undo it.
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => restore(snapshot.id)}
                        disabled={isPending}
                        className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-accent px-3 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {restoring ? "Restoring…" : "Restore this version"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={isPending}
                        className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-glass-border px-3 text-[12px] font-medium text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {message ? (
        <p className="mt-3 rounded-lg border border-success/20 bg-success-dim px-3 py-2 text-[12px] text-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
