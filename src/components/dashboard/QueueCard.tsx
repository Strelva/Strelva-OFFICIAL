"use client";

import { Check, X, Star, Calendar, MessageSquare, Bot, Zap } from "lucide-react";
import type { UnifiedEvent } from "@/lib/types";

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  google: { bg: "bg-blue-500/15", text: "text-blue-400" },
  yelp: { bg: "bg-red-500/15", text: "text-red-400" },
  instagram: { bg: "bg-pink-500/15", text: "text-pink-400" },
  ai: { bg: "bg-purple-500/15", text: "text-purple-400" },
  website: { bg: "bg-gray-bg", text: "text-gray-fg" },
  calendly: { bg: "bg-green-500/15", text: "text-green-400" },
  vegaro: { bg: "bg-green-500/15", text: "text-green-400" },
  default: { bg: "bg-gray-bg", text: "text-gray-muted" },
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  google: <Star className="w-3.5 h-3.5" strokeWidth={1.5} />,
  yelp: <Star className="w-3.5 h-3.5" strokeWidth={1.5} />,
  calendly: <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />,
  vegaro: <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />,
  website: <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />,
  ai: <Bot className="w-3.5 h-3.5" strokeWidth={1.5} />,
  instagram: <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />,
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface QueueCardProps {
  event: UnifiedEvent;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  disabled?: boolean;
}

export function QueueCard({ event, onApprove, onDismiss, disabled }: QueueCardProps) {
  const colors = SOURCE_COLORS[event.source] || SOURCE_COLORS.default;
  const icon = SOURCE_ICONS[event.source] || <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />;
  const isPending = event.status === "pending";

  return (
    <div
      className={`group rounded-xl border border-glass-border bg-surface-raised p-4 transition-all duration-150 ${
        disabled ? "opacity-50" : "hover:bg-gray-bg"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Source icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}>
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-gray-muted uppercase tracking-wide">
              {event.source}
            </span>
            <span className="text-[10px] text-gray-subtle">
              {formatTimestamp(event.createdAt)}
            </span>
            {!isPending && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  event.status === "approved" || event.status === "auto_approved"
                    ? "bg-success-dim text-success"
                    : "bg-gray-bg text-gray-muted"
                }`}
              >
                {event.status === "auto_approved" ? "auto" : event.status}
              </span>
            )}
          </div>
          <h3 className="text-[14px] font-medium text-warm-black leading-snug">
            {event.title}
          </h3>
          {event.body && (
            <p className="text-[12px] text-gray-fg mt-1 line-clamp-2">
              {event.body}
            </p>
          )}
        </div>

        {/* Actions - always visible on mobile, hover on desktop */}
        {isPending && !disabled && (
          <div className="flex items-center gap-1.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => onApprove(event.id)}
              disabled={disabled}
              className="w-11 h-11 lg:w-8 lg:h-8 rounded-lg bg-success-dim text-success hover:bg-success hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
              title="Approve"
            >
              <Check className="w-5 h-5 lg:w-4 lg:h-4" strokeWidth={2} />
            </button>
            <button
              onClick={() => onDismiss(event.id)}
              disabled={disabled}
              className="w-11 h-11 lg:w-8 lg:h-8 rounded-lg bg-gray-bg text-gray-muted hover:bg-gray-bg-hover hover:text-gray-fg flex items-center justify-center transition-colors disabled:opacity-50"
              title="Dismiss"
            >
              <X className="w-5 h-5 lg:w-4 lg:h-4" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
