"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, RotateCcw, Save, ShieldCheck } from "lucide-react";
import type { SiteSnapshotSummary } from "@/lib/storage";
import { useDashboardOptional } from "./DashboardContext";

interface SiteSafetyPanelProps {
  latestSnapshot: SiteSnapshotSummary | null;
}

function formatSnapshotDate(value: string | undefined): string {
  if (!value) return "No backup yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SiteSafetyPanel({ latestSnapshot }: SiteSafetyPanelProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const [snapshot, setSnapshot] = useState<SiteSnapshotSummary | null>(latestSnapshot);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveBackup() {
    setError("");
    setMessage("");
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
      setSnapshot(body.snapshot as SiteSnapshotSummary);
      setMessage("Backup saved. You can restore to it if a future change goes wrong.");
    });
  }

  function restoreBackup() {
    if (!snapshot) return;
    setError("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch(dashboardHref("/api/site-snapshots"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "restore", snapshotId: snapshot.id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.restored) {
        setError(body?.error || "Could not restore this backup.");
        return;
      }
      setSnapshot(body.restored as SiteSnapshotSummary);
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
            Full-site backups capture every editable section, so AI or setup changes can be undone without hunting section by section.
          </p>
        </div>
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-success" strokeWidth={1.5} />
      </div>

      <div className="rounded-xl border border-gray-border/70 bg-surface-raised px-3 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-faint">
          Latest backup
        </p>
        <p className="mt-1 text-[14px] font-medium text-warm-black">
          {snapshot?.label || "No full-site backup yet"}
        </p>
        <p className="mt-1 text-[12px] text-gray-muted">
          {formatSnapshotDate(snapshot?.createdAt)}
          {snapshot ? ` · ${snapshot.sections.length} sections` : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={saveBackup}
          disabled={isPending}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-warm-white px-4 text-[13px] font-medium text-on-warm-white transition-colors hover:bg-warm-white/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" strokeWidth={1.5} />
          Save backup
        </button>
        <button
          type="button"
          onClick={restoreBackup}
          disabled={isPending || !snapshot}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-glass-border px-4 text-[13px] font-medium text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
          Restore latest backup
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

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
