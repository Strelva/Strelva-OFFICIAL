"use client";

import { useState } from "react";
import { Upload, Clock, History, Loader2, Check, AlertCircle, RotateCcw } from "lucide-react";

interface PublishBarProps {
  hasDrafts: boolean;
  onPublish: () => Promise<void>;
  onDiscard?: () => Promise<void>;
  onViewHistory?: () => void;
  lastPublished?: string;
}

export function PublishBar({
  hasDrafts,
  onPublish,
  onDiscard,
  onViewHistory,
  lastPublished,
}: PublishBarProps) {
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState(false);

  const handlePublish = async () => {
    setPublishing(true);
    setError(false);
    try {
      await onPublish();
      setPublished(true);
      setTimeout(() => setPublished(false), 2000);
    } catch {
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
          <div className="flex items-center gap-1.5 text-amber-400">
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[11px] font-medium">Showing unpublished draft</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[11px] font-medium">All changes live</span>
          </div>
        )}
        {lastPublished && (
          <div className="flex items-center gap-1.5 text-gray-faint">
            <Clock className="w-3 h-3" strokeWidth={1.5} />
            <span className="text-[10px]">Published {formatTime(lastPublished)}</span>
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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            hasDrafts && !publishing
              ? "bg-accent text-white hover:bg-accent/90"
              : "bg-gray-bg text-gray-faint cursor-not-allowed"
          }`}
        >
          {publishing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          ) : published ? (
            <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : error ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400" strokeWidth={1.5} />
          ) : (
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          {publishing ? "Pushing..." : published ? "Pushed!" : error ? "Failed" : "Push"}
        </button>
      </div>
    </div>
  );
}
