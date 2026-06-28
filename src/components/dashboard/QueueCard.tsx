"use client";

import { useRef, useState, useCallback } from "react";
import { Check, X, Star, Calendar, MessageSquare, Bot, Zap, Quote, GitBranch, ClipboardCheck, PackageCheck } from "lucide-react";
import type { UnifiedEvent } from "@/lib/types";
import { UseAsTestimonialModal } from "./UseAsTestimonialModal";

const SWIPE_THRESHOLD = 100;

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

function formatEventStatus(event: UnifiedEvent): string {
  if (event.status === "approved") {
    // Structural changes are handed to the builder, not auto-published — don't
    // claim "Made live" for a change that hasn't shipped to the live site.
    return event.type === "content_update" &&
      event.metadata?.kind === "manual_structural_change"
      ? "Sent to your builder"
      : "Made live";
  }
  if (event.status === "auto_approved") return "Handled";
  if (event.status === "dismissed") return "Skipped";
  return "Needs you";
}

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
  onWorkflowAction?: (id: string, action: "triaged" | "quoted" | "accepted" | "in_progress" | "shipped" | "declined") => void;
  disabled?: boolean;
}

function metadataString(event: UnifiedEvent, key: string): string | null {
  const value = event.metadata?.[key];
  return typeof value === "string" ? value : null;
}

function formatWorkflowStatus(status: string | null): string {
  if (status === "in_progress") return "In progress";
  if (status === "shipped") return "Shipped";
  if (status === "declined") return "Declined";
  if (status === "quoted") return "Quoted";
  if (status === "accepted") return "Accepted";
  if (status === "triaged") return "Triaged";
  return "Requested";
}

export function QueueCard({ event, onApprove, onDismiss, onWorkflowAction, disabled }: QueueCardProps) {
  const colors = SOURCE_COLORS[event.source] || SOURCE_COLORS.default;
  const icon = SOURCE_ICONS[event.source] || <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />;
  const isPending = event.status === "pending";
  const isCustomRequest = event.type === "change_request" && event.metadata?.kind === "custom_code_or_design_request";
  const workflowStatus = isCustomRequest ? metadataString(event, "workflowStatus") || "requested" : null;
  const repo = isCustomRequest && event.metadata?.customRepo && typeof event.metadata.customRepo === "object"
    ? event.metadata.customRepo as Record<string, unknown>
    : null;
  const repoName = typeof repo?.repoName === "string" ? repo.repoName : null;
  const triageDueAt = isCustomRequest ? metadataString(event, "triageDueAt") : null;

  // "Use as testimonial" modal state
  const [testimonialModalOpen, setTestimonialModalOpen] = useState(false);

  // Check if this event is a review that can be converted to testimonial
  const isReview = event.source === "google" || event.source === "yelp";
  const reviewData = isReview && event.metadata
    ? {
        id: event.id,
        author: (event.metadata as Record<string, unknown>).author as string || "Customer",
        text: event.body || "",
        source: event.source,
        rating: (event.metadata as Record<string, unknown>).rating as number || 5,
      }
    : null;

  // Swipe state
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || !isPending) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsSwiping(true);
  }, [disabled, isPending]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping || disabled || !isPending) return;

    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Determine swipe direction on first significant move
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    // Only handle horizontal swipes
    if (isHorizontalSwipe.current) {
      e.preventDefault();
      setSwipeX(deltaX);
    }
  }, [isSwiping, disabled, isPending]);

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping) return;

    if (swipeX > SWIPE_THRESHOLD) {
      onApprove(event.id);
    } else if (swipeX < -SWIPE_THRESHOLD) {
      onDismiss(event.id);
    }

    setSwipeX(0);
    setIsSwiping(false);
    isHorizontalSwipe.current = null;
  }, [isSwiping, swipeX, event.id, onApprove, onDismiss]);

  // Calculate background hint based on swipe distance
  const swipeProgress = Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1);
  const isApproveSwipe = swipeX > 0;
  const isDismissSwipe = swipeX < 0;

  return (
    <div className="queue-card-swipe-container relative overflow-hidden rounded-xl">
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
          {/* Swipe icons */}
          {isApproveSwipe && swipeProgress > 0.3 && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-success transition-opacity" style={{ opacity: swipeProgress }}>
              <Check className="w-6 h-6" strokeWidth={2} />
            </div>
          )}
          {isDismissSwipe && swipeProgress > 0.3 && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-fg transition-opacity" style={{ opacity: swipeProgress }}>
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
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`queue-card-swipeable group rounded-xl border border-glass-border bg-glass p-4 relative transition-colors ${
          disabled ? "opacity-50" : "hover:bg-gray-bg"
        }`}
      >
      <div className="flex items-start gap-3">
        {/* Source icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCustomRequest ? "bg-amber-500/15 text-amber-500" : `${colors.bg} ${colors.text}`}`}>
          {isCustomRequest ? <GitBranch className="w-3.5 h-3.5" strokeWidth={1.5} /> : icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-gray-muted uppercase tracking-wide">
              {isCustomRequest ? "custom repo request" : event.source}
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
                {formatEventStatus(event)}
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
          {isCustomRequest && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                {formatWorkflowStatus(workflowStatus)}
              </span>
              {repoName && (
                <span className="rounded-full bg-gray-bg px-2 py-0.5 text-[10px] font-medium text-gray-muted">
                  Repo: {repoName}
                </span>
              )}
              {triageDueAt && workflowStatus === "requested" && (
                <span className="rounded-full bg-gray-bg px-2 py-0.5 text-[10px] font-medium text-gray-muted">
                  Triage by {new Date(triageDueAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {isPending && !disabled && isCustomRequest && onWorkflowAction && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 shrink-0">
            {workflowStatus === "requested" && (
              <button
                onClick={() => onWorkflowAction(event.id, "triaged")}
                className="h-9 rounded-lg bg-amber-500/10 px-2.5 text-[12px] font-medium text-amber-700 hover:bg-amber-500 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                title="Mark triaged"
              >
                <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />
                Triaged
              </button>
            )}
            {(workflowStatus === "triaged" || workflowStatus === "quoted" || workflowStatus === "accepted") && (
              <button
                onClick={() => onWorkflowAction(event.id, "in_progress")}
                className="h-9 rounded-lg bg-accent-dim px-2.5 text-[12px] font-medium text-accent hover:bg-accent hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                title="Mark in progress"
              >
                <GitBranch className="w-4 h-4" strokeWidth={1.5} />
                Start
              </button>
            )}
            <button
              onClick={() => onWorkflowAction(event.id, "shipped")}
              className="h-9 rounded-lg bg-success-dim px-2.5 text-[12px] font-medium text-success hover:bg-success hover:text-white flex items-center justify-center gap-1.5 transition-colors"
              title="Mark shipped"
            >
              <PackageCheck className="w-4 h-4" strokeWidth={1.5} />
              Shipped
            </button>
            <button
              onClick={() => onWorkflowAction(event.id, "declined")}
              className="h-9 rounded-lg bg-gray-bg px-2.5 text-[12px] font-medium text-gray-muted hover:bg-gray-bg-hover hover:text-gray-fg flex items-center justify-center gap-1.5 transition-colors"
              title="Decline request"
            >
              <X className="w-4 h-4" strokeWidth={2} />
              Decline
            </button>
          </div>
        )}
        {isPending && !disabled && !isCustomRequest && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 shrink-0">
            {/* Use as Testimonial button for reviews */}
            {isReview && reviewData && (
              <button
                onClick={() => setTestimonialModalOpen(true)}
                disabled={disabled}
                className="h-9 rounded-lg bg-sage/10 px-2.5 text-[12px] font-medium text-sage hover:bg-sage hover:text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                title="Use as Testimonial"
              >
                <Quote className="w-4 h-4" strokeWidth={1.5} />
                Use review
              </button>
            )}
            <button
              onClick={() => onApprove(event.id)}
              disabled={disabled}
              className="h-9 rounded-lg bg-success-dim px-2.5 text-[12px] font-medium text-success hover:bg-success hover:text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              title="Make live"
            >
              <Check className="w-4 h-4" strokeWidth={2} />
              Make live
            </button>
            <button
              onClick={() => onDismiss(event.id)}
              disabled={disabled}
              className="h-9 rounded-lg bg-gray-bg px-2.5 text-[12px] font-medium text-gray-muted hover:bg-gray-bg-hover hover:text-gray-fg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              title="Skip"
            >
              <X className="w-4 h-4" strokeWidth={2} />
              Skip
            </button>
          </div>
        )}
      </div>
      </div>

      {/* Use as Testimonial Modal */}
      {reviewData && (
        <UseAsTestimonialModal
          open={testimonialModalOpen}
          onClose={() => setTestimonialModalOpen(false)}
          review={reviewData}
          onSuccess={() => {
            // Mark the source review as handled after converting it.
            onApprove(event.id);
          }}
        />
      )}
    </div>
  );
}
