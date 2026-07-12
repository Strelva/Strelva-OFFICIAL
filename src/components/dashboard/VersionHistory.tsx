"use client";

import { useEffect, useState, useCallback } from "react";
import { History, RotateCcw, Check, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { useDashboard } from "./DashboardContext";

interface ContentVersion {
  id: string;
  section: string;
  data: unknown;
  author: "user" | "ai" | "admin";
  timestamp: string;
  status: "live" | "rolled-back";
  changes?: { field: string; before: string; after: string }[];
}

// Legacy format — kept for backward compatibility with old snapshots
interface ActivityEntry {
  text: string;
  time: string;
  type: string;
  section?: string;
  actor?: "user" | "ai" | "admin";
  changes?: { field: string; before: string; after: string }[];
  snapshot?: unknown;
}

interface VersionHistoryProps {
  section: string;
  onRestored: () => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Walk an object and produce flat key/value pairs for a compact preview.
function flatten(obj: unknown, prefix = ""): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object") {
    out.push({ key: prefix || "(value)", value: String(obj) });
    return out;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      out.push({ key: prefix, value: "[]" });
      return out;
    }
    obj.forEach((item, i) => {
      out.push(...flatten(item, `${prefix}[${i}]`));
    });
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      out.push(...flatten(v, next));
    } else {
      out.push({ key: next, value: v === "" ? "(empty)" : String(v) });
    }
  }
  return out;
}

export function VersionHistory({ section, onRestored }: VersionHistoryProps) {
  const { dashboardHref } = useDashboard();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const load = useCallback(() => {
    setLoading(true);
    // Try new versioning API first, fall back to legacy activity snapshots
    fetch(dashboardHref(`/api/content/${section}/versions`), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((versions: ContentVersion[] | null) => {
        if (versions && versions.length > 0) {
          // Convert ContentVersion to ActivityEntry shape for the existing UI
          const mapped: ActivityEntry[] = versions.map((v) => ({
            text: v.changes?.some((c) => c.field === "_restore")
              ? "Restored version"
              : `Updated by ${v.author}`,
            time: v.timestamp,
            type: v.author === "ai" ? "ai" : "admin",
            section: v.section,
            actor: v.author,
            changes: v.changes,
            snapshot: v.data,
            _versionId: v.id,
          }));
          setEntries(mapped);
          return;
        }
        // Fallback: legacy activity-based versions
        return fetch(dashboardHref(`/api/activity?section=${encodeURIComponent(section)}`), {
          credentials: "same-origin",
        })
          .then((res) => (res.ok ? res.json() : []))
          .then((data: ActivityEntry[]) => {
            const withSnap = Array.isArray(data)
              ? data.filter((e) => e.snapshot !== undefined && e.snapshot !== null).slice(0, 20)
              : [];
            setEntries(withSnap);
          });
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [dashboardHref, section]);

  useEffect(() => {
    load();
    setSelected(null);
    setStatus("idle");
  }, [load]);

  const handleRestore = useCallback(async () => {
    if (!selected || selected.snapshot === undefined) return;
    setRestoring(true);
    setStatus("idle");
    try {
      // Use new versioning API if the entry has a _versionId
      const versionId = (selected as ActivityEntry & { _versionId?: string })._versionId;
      let res: Response;
      if (versionId) {
        res = await fetch(dashboardHref(`/api/content/${section}/versions`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ versionId }),
        });
      } else {
        // Legacy: PUT snapshot directly
        res = await fetch(dashboardHref(`/api/content/${section}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(selected.snapshot),
        });
      }
      if (res.ok) {
        setStatus("success");
        onRestored();
        load();
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setRestoring(false);
    }
  }, [dashboardHref, section, selected, onRestored, load]);

  if (loading && !entries) {
    return (
      <div className="p-4 space-y-3">
        <SkeletonLine width="w-1/2" height="h-4" />
        <SkeletonLine width="w-full" height="h-10" />
        <SkeletonLine width="w-full" height="h-10" />
        <SkeletonLine width="w-full" height="h-10" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-[18px] h-[18px] text-gray-muted" strokeWidth={1.5} />}
        title="No previous versions"
        description="Versions appear after changes are published live. Draft-only saves stay pending until you publish."
        className="h-full"
      />
    );
  }

  // Preview of a selected snapshot
  if (selected) {
    const preview = flatten(selected.snapshot).slice(0, 60);
    return (
      <div className="flex flex-col h-full bg-surface">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-border shrink-0">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-[11px] text-gray-muted hover:text-warm-black transition-colors"
          >
            <ArrowLeft className="w-3 h-3" strokeWidth={1.5} />
            Back
          </button>
          <span className="text-[11px] text-gray-muted">
            {relativeTime(selected.time)} · {selected.actor ?? "user"}
          </span>
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-border bg-gray-bg-alt shrink-0">
          <span className="text-[11px] text-gray-muted">Preview (read-only)</span>
          <Button
            variant="primary"
            size="sm"
            loading={restoring}
            icon={!restoring ? <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> : undefined}
            onClick={handleRestore}
          >
            Restore this version
          </Button>
        </div>

        {status === "success" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-border bg-positive0/[0.04] shrink-0">
            <Check className="w-3 h-3 text-positive" strokeWidth={1.5} />
            <span className="text-[11px] text-positive">Restored. Preview updated</span>
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-border bg-critical0/[0.04] shrink-0">
            <AlertCircle className="w-3 h-3 text-critical0" strokeWidth={1.5} />
            <span className="text-[11px] text-critical">Couldn&apos;t restore. Try again</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {preview.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-gray-muted">No fields in this snapshot.</p>
          ) : (
            <ul className="divide-y divide-gray-border">
              {preview.map((row, i) => (
                <li key={`${row.key}-${i}`} className="px-4 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-gray-muted truncate">
                    {row.key}
                  </div>
                  <div className="text-[12px] text-warm-black break-words line-clamp-3">
                    {row.value}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // List of versions
  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-4 py-2.5 border-b border-gray-border shrink-0">
        <span className="text-[11px] uppercase tracking-wider text-gray-muted">
          Last {entries.length} version{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto divide-y divide-gray-border">
        {entries.map((entry, i) => {
          const changeCount = entry.changes?.length ?? 0;
          const summary =
            changeCount > 0
              ? `${changeCount} field${changeCount === 1 ? "" : "s"} changed`
              : entry.text;
          return (
            <li key={`${entry.time}-${i}`}>
              <button
                onClick={() => setSelected(entry)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-bg-alt transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-warm-black">
                    {relativeTime(entry.time)}
                  </span>
                  <span className="text-[11px] text-gray-muted uppercase tracking-wider">
                    {entry.actor ?? "user"}
                  </span>
                </div>
                <div className="text-[11px] text-gray-muted mt-0.5 truncate">{summary}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
