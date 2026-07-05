"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { X, Quote, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDashboardOptional } from "./DashboardContext";

interface ReviewData {
  id: string;
  author: string;
  text: string;
  source: string;
  rating: number;
}

interface UseAsTestimonialModalProps {
  open: boolean;
  onClose: () => void;
  review: ReviewData | null;
  onSuccess?: () => void;
}

export function UseAsTestimonialModal({
  open,
  onClose,
  review,
  onSuccess,
}: UseAsTestimonialModalProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const [quote, setQuote] = useState(review?.text || "");
  const [author, setAuthor] = useState(review?.author || "");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when review changes
  useEffect(() => {
    if (review) {
      setQuote(review.text);
      setAuthor(review.author);
      setLocation(`via ${review.source}`);
    }
  }, [review]);

  const handleSave = useCallback(async () => {
    if (!quote.trim() || !author.trim()) {
      setError("Quote and author are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Append atomically server-side (the server reads + merges + writes under
      // a lock). Sending only the new item avoids the GET-then-PUT lost-update
      // that dropped a testimonial when two saves landed close together.
      const saveRes = await fetch(dashboardHref("/api/content/testimonials/append"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          quote: quote.trim(),
          author: author.trim(),
          location: location.trim() || `via ${review?.source || "review"}`,
        }),
      });

      if (!saveRes.ok) throw new Error("Failed to save testimonial");

      setSaved(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
        setSaved(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [dashboardHref, quote, author, location, review, onClose, onSuccess]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !review) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Use review as testimonial"
        className="relative w-full max-w-lg overflow-hidden rounded-xl bg-surface-raised shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sage/10 flex items-center justify-center">
              <Quote className="w-4 h-4 text-sage" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-warm-black">
                Use as Testimonial
              </h2>
              <p className="text-[12px] text-gray-muted">
                Add this review to your testimonials section
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-muted hover:bg-gray-bg hover:text-warm-black transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Source badge */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-gray-bg text-gray-muted font-medium uppercase">
              {review.source}
            </span>
            <span className="text-gray-muted">
              {review.rating} star{review.rating !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Quote field */}
          <div>
            <label className="block text-[11px] font-medium text-gray-fg mb-1.5">
              Quote
            </label>
            <textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-border bg-surface text-[13px] text-warm-black resize-none outline-none focus:border-sage transition-colors"
              placeholder="Customer quote..."
            />
            <p className="text-[11px] text-gray-muted mt-1">
              You can edit the quote before adding
            </p>
          </div>

          {/* Author field */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-fg mb-1.5">
                Author
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-border bg-surface text-[13px] text-warm-black outline-none focus:border-sage transition-colors"
                placeholder="Customer name"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-fg mb-1.5">
                Location / Context
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-border bg-surface text-[13px] text-warm-black outline-none focus:border-sage transition-colors"
                placeholder="e.g. via Google"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] text-red-500">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-border px-5 py-3 bg-gray-bg-alt">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving || saved}
            icon={
              saved ? (
                <Check className="w-3.5 h-3.5" strokeWidth={2} />
              ) : saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : undefined
            }
          >
            {saved ? "Added!" : saving ? "Adding..." : "Add to Testimonials"}
          </Button>
        </div>
      </div>
    </div>
  );
}
