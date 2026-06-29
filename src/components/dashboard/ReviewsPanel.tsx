"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, Sparkles, Check, Copy, Loader2, MessageSquare } from "lucide-react";
import type { ReviewItem } from "@/lib/types";
import { useDashboard } from "./DashboardContext";

interface ReviewsPanelProps {
  reviews: ReviewItem[];
  googlePlaceId?: string;
}

/** A shareable Google "write a review" link — owners need more reviews, not more reply tools. */
function ReviewRequestCard({ placeId }: { placeId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the link is still visible to copy manually
    }
  };
  return (
    <div className="mb-6 rounded-xl border border-accent/20 bg-accent-dim/40 p-4 sm:p-5">
      <h2 className="text-[14px] font-medium text-warm-black">Get more reviews</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">
        Share this link with happy customers — it opens straight to your Google review form.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate rounded-lg border border-gray-border bg-surface-base px-3 py-2 text-[12px] text-gray-muted hover:text-warm-black"
        >
          {url}
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-surface-base transition-opacity hover:opacity-90"
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(Math.min(5, Math.max(0, rating)));
  return (
    <div className="flex items-center gap-0.5" aria-label={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= filled ? "fill-accent text-accent" : "text-gray-border"}`}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

function formatDate(date: string): string {
  const d = new Date(date.length <= 10 ? date + "T00:00:00" : date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sourceLabel(source: ReviewItem["source"]): string {
  if (source === "google") return "Google";
  if (source === "yelp") return "Yelp";
  return "Manual";
}

function ReviewCard({ review }: { review: ReviewItem }) {
  const { dashboardHref, readOnly } = useDashboard();
  const [draft, setDraft] = useState<string | null>(review.reply ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Locally track the saved reply so the card can flip to the locked "Your
  // reply" state right after a save without waiting for a full page refresh.
  const [savedReply, setSavedReply] = useState<{ reply: string; repliedAt?: string } | null>(
    review.reply ? { reply: review.reply, repliedAt: review.repliedAt } : null,
  );

  const hasExistingReply = Boolean(savedReply);

  async function generateDraft() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(dashboardHref("/api/reviews/draft-reply"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: review.author, rating: review.rating, text: review.text }),
      });
      if (!res.ok) throw new Error("Could not draft a reply");
      const data = (await res.json()) as { reply?: string };
      if (!data.reply) throw new Error("No reply returned");
      setDraft(data.reply);
    } catch {
      setError("Could not draft a reply. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the text and copy manually.");
    }
  }

  async function saveReply() {
    if (!draft || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(dashboardHref("/api/reviews/reply"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id, reply: draft }),
      });
      if (!res.ok) throw new Error("Could not save the reply");
      const data = (await res.json()) as { review?: ReviewItem };
      const saved = data.review;
      setSavedReply({
        reply: saved?.reply ?? draft,
        repliedAt: saved?.repliedAt,
      });
    } catch {
      setError("Could not save the reply. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl dashboard-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-warm-black truncate">{review.author}</p>
          <div className="mt-1 flex items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-[11px] text-gray-muted">{formatDate(review.date)}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-glass-border bg-glass px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-muted">
          {sourceLabel(review.source)}
        </span>
      </div>

      {review.text && (
        <p className="mt-3 text-[13px] leading-relaxed text-gray-fg">{review.text}</p>
      )}

      {/* Reply area */}
      {hasExistingReply && !loading ? (
        <div className="mt-4 rounded-lg border border-glass-border bg-glass p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-muted">
            Your reply
          </p>
          <p className="text-[13px] leading-relaxed text-warm-black">{savedReply?.reply}</p>
          {savedReply?.repliedAt && (
            <p className="mt-2 text-[11px] text-gray-muted">Replied {formatDate(savedReply.repliedAt)}</p>
          )}
        </div>
      ) : draft ? (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
            Drafted reply
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[13px] leading-relaxed text-warm-black outline-none transition-colors focus:border-accent"
            aria-label="Edit drafted reply"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyDraft}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent/85"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Copy reply
                </>
              )}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={saveReply}
                disabled={saving}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-glass-border bg-glass px-3 text-[12px] font-medium text-warm-black transition-colors hover:bg-gray-bg disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Save reply
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={generateDraft}
              disabled={loading || readOnly}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-glass-border bg-glass px-3 text-[12px] font-medium text-warm-black transition-colors hover:bg-gray-bg disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
              Redraft
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            onClick={generateDraft}
            disabled={loading || readOnly}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-glass-border bg-glass px-3 text-[12px] font-medium text-warm-black transition-colors hover:bg-gray-bg disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                Drafting...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
                Draft a reply
              </>
            )}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-gray-muted">{error}</p>}
    </div>
  );
}

export function ReviewsPanel({ reviews, googlePlaceId }: ReviewsPanelProps) {
  const { dashboardHref } = useDashboard();
  if (reviews.length === 0) {
    return (
      <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
              Reviews
            </p>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-warm-black sm:text-[30px]">
              No reviews yet
            </h1>
          </div>
          {googlePlaceId && <ReviewRequestCard placeId={googlePlaceId} />}
          <div className="rounded-xl dashboard-panel p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent">
              <MessageSquare className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] font-medium text-warm-black">
              No reviews yet — connect Google to pull them in
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-gray-muted">
              Once your Google Business Profile is connected, your reviews show up here and the AI
              can draft a reply for each one.
            </p>
            <Link
              href={dashboardHref("/dashboard/integrations")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
            >
              Connect Google
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Reviews
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[24px] font-normal tracking-[-0.01em] text-warm-black sm:text-[30px]">
            What people are saying
          </h1>
          <div className="mt-3 flex items-center gap-3">
            {(() => {
              const rated = reviews.filter((r) => r.rating > 0);
              if (!rated.length) return null;
              const avg = rated.reduce((sum, r) => sum + r.rating, 0) / rated.length;
              return (
                <span className="flex items-center gap-1.5">
                  <Stars rating={avg} />
                  <span className="text-[14px] font-medium text-warm-black">{avg.toFixed(1)}</span>
                </span>
              );
            })()}
            <span className="text-[14px] text-gray-muted">
              {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </span>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-gray-muted">
            Draft a warm, on-brand reply for any of them, then copy it into Google.
          </p>
        </div>

        {googlePlaceId && <ReviewRequestCard placeId={googlePlaceId} />}

        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      </div>
    </div>
  );
}
