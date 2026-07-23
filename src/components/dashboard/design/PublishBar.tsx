"use client";

import { useState } from "react";
import { Upload, Clock, History, Loader2, Check, AlertCircle, RotateCcw } from "lucide-react";

export interface PublishOutcome {
  liveSite?: {
    status?: "revalidated" | "not_configured" | "failed";
    error?: string;
  };
}

interface PublishBarProps {
  hasDrafts: boolean;
  onPublish: () => Promise<PublishOutcome | void>;
  onDiscard?: () => Promise<void>;
  onViewHistory?: () => void;
  lastPublished?: string;
  liveSyncEnabled?: boolean;
}

export function PublishBar({
  hasDrafts,
  onPublish,
  onDiscard,
  onViewHistory,
  lastPublished,
  liveSyncEnabled = false,
}: PublishBarProps) {
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [published, setPublished] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<PublishOutcome | null>(null);
  const [error, setError] = useState(false);
  const liveStatus = lastOutcome?.liveSite?.status;
  const publishedStatusLabel =
    liveStatus === "revalidated"
      ? "Live site refreshed"
      : liveStatus === "failed"
        ? "Saved - live refresh failed"
        : "Changes saved";
  const idleStatusLabel = liveSyncEnabled ? "Live sync ready" : "No draft changes";
  const publishedButtonLabel =
    liveStatus === "revalidated" ? "Live refreshed" : liveStatus === "failed" ? "Refresh failed" : "Saved";
  const publishButtonLabel = liveSyncEnabled ? "Publish live" : "Save changes";
  const publishTitle = liveSyncEnabled
    ? "Publishes your changes and asks your live site to refresh."
    : "Saves your changes; live-site refresh isn't configured yet.";

  const handlePublish = async () => {
    setPublishing(true);
    setError(false);
    try {
      const outcome = await onPublish();
      setLastOutcome(outcome || null);
      setPublished(true);
      setTimeout(() => setPublished(false), 2000);
    } catch {
      setLastOutcome(null);
      setError(true);
      setTimeout(() => setError(false), 3000);
    } finally {
      setPublishing(false);
    }
  };

  const handleDiscard = async () => {
    if (!onDiscard) return;
    setDiscarding(true);
    setError(false);
    try {
      await onDiscard();
    } catch {
      setError(true);
      setTimeout(() => setError(false), 3000);
    } finally {
      setDiscarding(false);
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="h-12 border-t border-gray-border bg-surface flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        {hasDrafts ? (
          <div className="flex items-center gap-1.5 text-warning">
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[11px] font-medium">Draft preview active - review before publishing</span>
          </div>
        ) : (
          <div className={`flex items-center gap-1.5 ${published && liveStatus === "failed" ? "text-warning" : "text-positive"}`}>
            {published && liveStatus === "failed" ? (
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            ) : (
              <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
            <span className="text-[11px] font-medium">
              {published ? publishedStatusLabel : idleStatusLabel}
            </span>
          </div>
        )}
        {lastPublished && (
          <div className="flex items-center gap-1.5 text-gray-faint">
            <Clock className="w-3 h-3" strokeWidth={1.5} />
            <span className="text-[11px]">Published {formatTime(lastPublished)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onViewHistory && (
          <button
            onClick={onViewHistory}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
          >
            <History className="w-3.5 h-3.5" strokeWidth={1.5} />
            History
          </button>
        )}
        {onDiscard && (
          <button
            onClick={handleDiscard}
            disabled={!hasDrafts || publishing || discarding}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              hasDrafts && !publishing && !discarding
                ? "text-gray-muted hover:text-warm-white hover:bg-surface-raised"
                : "text-gray-faint cursor-not-allowed"
            }`}
          >
            {discarding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
            {discarding ? "Discarding..." : "Discard draft"}
          </button>
        )}
        <button
          onClick={handlePublish}
          disabled={!hasDrafts || publishing}
          title={publishTitle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            hasDrafts && !publishing
              ? "bg-accent text-on-accent hover:bg-accent/90"
              : "bg-gray-bg text-gray-faint cursor-not-allowed"
          }`}
        >
          {publishing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          ) : published ? (
            <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : error ? (
            <AlertCircle className="w-3.5 h-3.5 text-critical" strokeWidth={1.5} />
          ) : (
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          {publishing
            ? "Publishing..."
            : published
              ? publishedButtonLabel
              : error
                ? "Failed"
                : publishButtonLabel}
        </button>
      </div>
    </div>
  );
}
