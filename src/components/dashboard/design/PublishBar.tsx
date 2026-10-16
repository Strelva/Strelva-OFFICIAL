"use client";

import { useState } from "react";
import { XaButton, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";

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
      ? "Live on your site."
      : liveStatus === "failed"
        ? "Saved. The live site hasn't refreshed yet."
        : "Saved.";
  const idleStatusLabel = liveSyncEnabled ? "Everything here is live" : "No changes waiting";
  const publishButtonLabel = liveSyncEnabled ? "Make it live" : "Save changes";
  const publishTitle = liveSyncEnabled
    ? "Puts your changes live and refreshes your site."
    : "Saves your changes. Your live site refreshes when Strelva switches that on.";

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

  const status = hasDrafts
    ? <XaStatus kind="waits" size="sm">Your changes wait for your yes. Visitors still see the live site.</XaStatus>
    : publishing ? <XaStatus kind="working" size="sm">Putting it live</XaStatus>
      : error ? <XaStatus kind="down" size="sm">It didn&apos;t go live. Nothing changed on your site.</XaStatus>
        : published ? <XaStatus kind={liveStatus === "failed" ? "waits" : "live"} size="sm">{publishedStatusLabel}</XaStatus>
          : <span className="text-[13px] text-[var(--st-text-3)]">{idleStatusLabel}{lastPublished ? `. Last put live ${formatTime(lastPublished)}` : ""}</span>;

  return (
    <div className="flex min-h-[56px] shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--st-line)] bg-[var(--st-canvas)] px-4 py-2" role="region" aria-label="Your changes">
      <div className="min-w-0" aria-live="polite">{status}</div>
      <div className="flex items-center gap-4">
        {onViewHistory ? <XaTextLink onClick={onViewHistory}>History</XaTextLink> : null}
        {onDiscard && hasDrafts && !publishing ? <XaTextLink onClick={() => void handleDiscard()}>{discarding ? "Discarding" : "Discard draft"}</XaTextLink> : null}
        {hasDrafts ? (
          <XaButton variant="primary" size="sm" busy={publishing} title={publishTitle} onClick={() => void handlePublish()}>
            {publishButtonLabel}
          </XaButton>
        ) : null}
      </div>
    </div>
  );
}
