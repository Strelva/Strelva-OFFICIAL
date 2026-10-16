"use client";

import { useMemo, useState, useTransition } from "react";
import { XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import { ConfirmDialog } from "./ConfirmDialog";
import { DashNote, DashSection } from "./xa/DashboardXa";
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
        setError(body?.error || "That didn't save. Your site is unchanged.");
        return;
      }
      setSnapshots((prev) => [body.snapshot as SiteSnapshotSummary, ...prev]);
      setMessage("Saved. You can go back to it if a later change goes wrong.");
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
        setError(body?.error || "That didn't go through. Your live site is unchanged.");
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
      setMessage(
        body.liveSite?.status === "failed"
          ? "Done. Your live site hasn't refreshed yet; Strelva keeps trying."
          : "Done. Your site is back to that version, and the one before it is saved too."
      );
    });
  }

  const confirming = snapshots.find((snapshot) => snapshot.id === confirmingId) ?? null;

  return (
    <DashSection label="Saved versions" aside={<XaTextLink onClick={saveBackup}>{isPending && !restoringId ? "Saving" : "Save one now"}</XaTextLink>}>
      <p className="m-0 max-w-[640px] text-[15px] leading-[1.5] text-[var(--st-text-2)]">
        Strelva saves your whole site every day. Go back to any saved version and your live site looks exactly like it did then.
      </p>
      {snapshots.length === 0 ? (
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">The first daily save lands tonight. Save one now if you want a version you name yourself.</p>
      ) : (
        <XaRows label="Saved versions">
          {snapshots.map((snapshot) => (
            <XaRow
              key={snapshot.id}
              title={snapshot.label}
              detail={`${formatSnapshotDate(snapshot.createdAt)} · ${snapshot.sections.length} parts of your site${snapshot.status === "restored" ? " · you went back to this one" : ""}`}
              action={<XaTextLink onClick={() => { setConfirmingId(snapshot.id); setError(""); setMessage(""); }} aria-label={`Go back to ${snapshot.label}, ${formatSnapshotDate(snapshot.createdAt)}`}>Go back to this</XaTextLink>}
            />
          ))}
        </XaRows>
      )}
      {message ? <DashNote tone="live" role="status">{message}</DashNote> : null}
      {error ? <DashNote tone="down" role="alert">{error}</DashNote> : null}
      <ConfirmDialog
        open={Boolean(confirming)}
        busy={Boolean(restoringId)}
        title={confirming ? `Go back to ${confirming.label.toLowerCase()} from ${formatSnapshotDate(confirming.createdAt)}?` : ""}
        confirmLabel="Put this version live"
        cancelLabel="Keep the site as it is"
        message="Your live site becomes exactly this saved version. Strelva saves the current site first, so you can come back to it."
        onCancel={() => setConfirmingId(null)}
        onConfirm={() => { if (confirmingId) restore(confirmingId); }}
      />
    </DashSection>
  );
}
