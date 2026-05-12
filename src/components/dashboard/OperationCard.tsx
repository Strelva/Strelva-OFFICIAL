"use client";

import { useRef, useState, useCallback } from "react";
import {
  Check,
  X,
  User,
  Bot,
  Link,
  Cog,
  AlertTriangle,
  AlertCircle,
  Circle,
  Edit3,
} from "lucide-react";
import type { SiteOperation, OperationSource, OperationRisk, OperationSurface } from "@/lib/types";

const SWIPE_THRESHOLD = 100;

const SOURCE_CONFIG: Record<OperationSource, { icon: React.ReactNode; label: string; color: string }> = {
  user: {
    icon: <User className="w-3.5 h-3.5" strokeWidth={1.5} />,
    label: "User",
    color: "bg-blue-500/15 text-blue-400",
  },
  agent: {
    icon: <Bot className="w-3.5 h-3.5" strokeWidth={1.5} />,
    label: "AI",
    color: "bg-purple-500/15 text-purple-400",
  },
  integration: {
    icon: <Link className="w-3.5 h-3.5" strokeWidth={1.5} />,
    label: "Integration",
    color: "bg-green-500/15 text-green-400",
  },
  system: {
    icon: <Cog className="w-3.5 h-3.5" strokeWidth={1.5} />,
    label: "System",
    color: "bg-gray-500/15 text-gray-400",
  },
};

const RISK_CONFIG: Record<OperationRisk, { icon: React.ReactNode; label: string; color: string }> = {
  low: {
    icon: <Circle className="w-3 h-3" strokeWidth={2} />,
    label: "Low risk",
    color: "text-gray-muted",
  },
  medium: {
    icon: <AlertCircle className="w-3 h-3" strokeWidth={2} />,
    label: "Review suggested",
    color: "text-yellow-400",
  },
  high: {
    icon: <AlertTriangle className="w-3 h-3" strokeWidth={2} />,
    label: "Needs your okay",
    color: "text-orange-400",
  },
};

const SURFACE_LABELS: Record<OperationSurface, string> = {
  site: "Site",
  assets: "Assets",
  sources: "Accounts",
  review: "Needs You",
  newsletter: "Newsletter",
  social: "Social",
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

function DiffPreview({ before, after }: { before?: unknown; after?: unknown }) {
  if (!before && !after) return null;

  const formatValue = (val: unknown): string => {
    if (val === undefined || val === null) return "(empty)";
    if (typeof val === "string") return val.length > 100 ? val.slice(0, 100) + "..." : val;
    return JSON.stringify(val, null, 2).slice(0, 100);
  };

  return (
    <div className="mt-3 text-[11px] font-mono bg-glass-active rounded-lg p-2.5 space-y-1.5">
      {before !== undefined && (
        <div className="flex gap-2">
          <span className="text-red-400 shrink-0">-</span>
          <span className="text-gray-muted break-all">{formatValue(before)}</span>
        </div>
      )}
      {after !== undefined && (
        <div className="flex gap-2">
          <span className="text-success shrink-0">+</span>
          <span className="text-gray-fg break-all">{formatValue(after)}</span>
        </div>
      )}
    </div>
  );
}

interface OperationCardProps {
  operation: SiteOperation;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onEditInCanvas?: (id: string) => void;
  disabled?: boolean;
  showDiff?: boolean;
}

export function OperationCard({
  operation,
  onApprove,
  onDismiss,
  onEditInCanvas,
  disabled,
  showDiff = true,
}: OperationCardProps) {
  const sourceConfig = SOURCE_CONFIG[operation.source];
  const riskConfig = operation.risk ? RISK_CONFIG[operation.risk] : null;
  const isPending = operation.status === "pending_review" || operation.status === "draft";
  const canEditInCanvas = operation.surface === "site" && onEditInCanvas;

  // Swipe state
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !isPending) return;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isHorizontalSwipe.current = null;
      setIsSwiping(true);
    },
    [disabled, isPending]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isSwiping || disabled || !isPending) return;

      const deltaX = e.touches[0].clientX - touchStartX.current;
      const deltaY = e.touches[0].clientY - touchStartY.current;

      if (isHorizontalSwipe.current === null) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
        }
      }

      if (isHorizontalSwipe.current) {
        e.preventDefault();
        setSwipeX(deltaX);
      }
    },
    [isSwiping, disabled, isPending]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping) return;

    if (swipeX > SWIPE_THRESHOLD) {
      onApprove(operation.id);
    } else if (swipeX < -SWIPE_THRESHOLD) {
      onDismiss(operation.id);
    }

    setSwipeX(0);
    setIsSwiping(false);
    isHorizontalSwipe.current = null;
  }, [isSwiping, swipeX, operation.id, onApprove, onDismiss]);

  const swipeProgress = Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1);
  const isApproveSwipe = swipeX > 0;
  const isDismissSwipe = swipeX < 0;

  return (
    <div className="operation-card-container relative overflow-hidden rounded-xl">
      {/* Swipe hint backgrounds */}
      {isPending && !disabled && (
        <>
          <div
            className="absolute inset-0 bg-success pointer-events-none transition-opacity"
            style={{ opacity: isApproveSwipe ? swipeProgress * 0.3 : 0 }}
          />
          <div
            className="absolute inset-0 bg-gray-muted pointer-events-none transition-opacity"
            style={{ opacity: isDismissSwipe ? swipeProgress * 0.3 : 0 }}
          />
          {isApproveSwipe && swipeProgress > 0.3 && (
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 text-success transition-opacity"
              style={{ opacity: swipeProgress }}
            >
              <Check className="w-6 h-6" strokeWidth={2} />
            </div>
          )}
          {isDismissSwipe && swipeProgress > 0.3 && (
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-fg transition-opacity"
              style={{ opacity: swipeProgress }}
            >
              <X className="w-6 h-6" strokeWidth={2} />
            </div>
          )}
        </>
      )}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className={`operation-card-swipeable group rounded-xl border border-glass-border bg-glass p-4 relative transition-colors ${
          disabled ? "opacity-50" : "hover:bg-gray-bg"
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Source icon */}
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sourceConfig.color}`}
          >
            {sourceConfig.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-medium text-gray-muted uppercase tracking-wide">
                {sourceConfig.label}
              </span>
              <span className="text-[10px] text-gray-subtle">
                {formatTimestamp(operation.createdAt)}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-glass-active text-gray-muted">
                {SURFACE_LABELS[operation.surface]}
              </span>
              {riskConfig && (
                <span className={`flex items-center gap-1 text-[10px] ${riskConfig.color}`}>
                  {riskConfig.icon}
                  <span className="hidden sm:inline">{riskConfig.label}</span>
                </span>
              )}
              {!isPending && (
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    operation.status === "approved" || operation.status === "published"
                      ? "bg-success-dim text-success"
                      : operation.status === "blocked"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-gray-bg text-gray-muted"
                  }`}
                >
                  {operation.status}
                </span>
              )}
            </div>
            <h3 className="text-[14px] font-medium text-warm-black leading-snug">
              {operation.title}
            </h3>
            {operation.description && (
              <p className="text-[12px] text-gray-fg mt-1 line-clamp-2">{operation.description}</p>
            )}
            {operation.reason && (
              <p className="text-[11px] text-gray-muted mt-1 italic">
                Reason: {operation.reason}
              </p>
            )}
            {showDiff && (operation.before !== undefined || operation.after !== undefined) && (
              <DiffPreview before={operation.before} after={operation.after} />
            )}
          </div>

          {/* Actions */}
          {isPending && !disabled && (
            <div className="flex flex-col items-end gap-1.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onApprove(operation.id)}
                  disabled={disabled}
                  className="w-11 h-11 lg:w-8 lg:h-8 rounded-lg bg-success-dim text-success hover:bg-success hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
                  title="Approve"
                >
                  <Check className="w-5 h-5 lg:w-4 lg:h-4" strokeWidth={2} />
                </button>
                <button
                  onClick={() => onDismiss(operation.id)}
                  disabled={disabled}
                  className="w-11 h-11 lg:w-8 lg:h-8 rounded-lg bg-gray-bg text-gray-muted hover:bg-gray-bg-hover hover:text-gray-fg flex items-center justify-center transition-colors disabled:opacity-50"
                  title="Dismiss"
                >
                  <X className="w-5 h-5 lg:w-4 lg:h-4" strokeWidth={2} />
                </button>
              </div>
              {canEditInCanvas && (
                <button
                  onClick={() => onEditInCanvas(operation.id)}
                  className="text-[11px] text-gray-muted hover:text-gray-fg flex items-center gap-1 transition-colors"
                >
                  <Edit3 className="w-3 h-3" strokeWidth={1.5} />
                  Edit in Canvas
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
