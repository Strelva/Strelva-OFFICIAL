"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, Sparkles, Check, Copy, Loader2, MessageSquare, Send } from "lucide-react";
import type { ReviewItem } from "@/lib/types";
import { buildGoogleReviewLink, buildReviewShareMessage } from "@/lib/reviews/reputation";
import { ReputationHeader } from "./ReputationHeader";
import { ReplyVoicePanel } from "./ReplyVoicePanel";
import { useDashboard } from "./DashboardContext";
import type { ReplyVoice } from "@/lib/reviews/reply-voice";

/** An AI reply already drafted for a review and waiting in the queue. */
export interface PreDraft {
  reply: string;
  /** ISO time this auto-posts (auto mode); null when it waits for approval. */
  autoPostAt: string | null;
}

interface ReviewsPanelProps {
  reviews: ReviewItem[];
  googlePlaceId?: string;
  /** True when the tenant's Google Business connection is live — Google reviews then publish replies directly. */
  gbpConnected?: boolean;
  /** The client's reply voice (mode + guidance + templates). */
  voice: ReplyVoice;
  /** Pre-drafted replies keyed by review id — so the card shows the ready reply, not a to-do. */
  preDrafts: Record<string, PreDraft>;
}

/** Small copy-to-clipboard button with a "Copied" flip; falls back silently to
 *  the still-visible text when the clipboard API is unavailable. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the text stays visible to copy manually
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-on-accent transition-opacity hover:opacity-90"
    >
      {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * The one-tap "get more reviews" action — more reviews is the #1 reputation
 * lever, so this hands the owner a ready-to-send message plus the raw Google
 * review link. When no Google listing is connected there's no link to fake, so
 * it degrades to an honest "connect your listing" state rather than a dead URL.
 */
export function ReviewRequestCard({
  placeId,
  connectHref,
}: {
  placeId?: string;
  connectHref: string;
}) {
  const url = buildGoogleReviewLink(placeId);

  if (!url) {
    return (
      <div className="mb-6 rounded-xl border border-glass-border bg-glass p-4 sm:p-5">
        <h2 className="text-[14px] font-medium text-warm-black">Get more reviews</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">
          Connect your Google listing to share a review link with happy customers. More reviews is
          the strongest thing you can do for your reputation.
        </p>
        <Link
          href={connectHref}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
        >
          Connect your Google listing
        </Link>
      </div>
    );
  }

  const message = buildReviewShareMessage(url);
  return (
    <div className="mb-6 rounded-xl border border-accent/20 bg-accent-dim/40 p-4 sm:p-5">
      <h2 className="text-[14px] font-medium text-warm-black">Get more reviews</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">
        Send a happy customer this message. The link opens straight to your Google review form.
      </p>

      {/* Ready-to-send message the owner can paste into a text or email. */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <p className="min-w-0 flex-1 rounded-lg border border-gray-border bg-surface-base px-3 py-2 text-[13px] leading-relaxed text-warm-black">
          {message}
        </p>
        <CopyButton text={message} label="Copy message" />
      </div>

      {/* The bare link on its own, for owners who want just the URL. */}
      <div className="mt-2 flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate rounded-lg border border-gray-border bg-surface-base px-3 py-2 text-[12px] text-gray-muted hover:text-warm-black"
        >
          {url}
        </a>
        <CopyButton text={url} label="Copy link" />
      </div>
    </div>
  );
}

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const filled = Math.round(Math.min(5, Math.max(0, rating)));
  const dim = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5" aria-label={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${dim} ${n <= filled ? "fill-accent text-accent" : "text-gray-border"}`}
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

/**
 * Where a copy-pasted reply should be pasted, named by the reviews on screen.
 * When every review is from one platform we name it ("Google"/"Yelp"); a mixed
 * list or manual reviews fall back to a platform-neutral phrase so the guidance
 * never tells a Yelp owner to "copy it into Google".
 */
export function copyDestination(reviews: ReviewItem[]): string {
  const sources = new Set(reviews.map((r) => r.source));
  if (sources.size === 1) {
    if (sources.has("google")) return "Google";
    if (sources.has("yelp")) return "Yelp";
  }
  return "the platform";
}

/** "in about 8h" / "shortly" — a soft countdown to an auto-post. Client-only. */
function untilLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "shortly";
  const h = Math.round(ms / 3_600_000);
  if (h >= 1) return `in about ${h}h`;
  return `in about ${Math.max(1, Math.round(ms / 60_000))}m`;
}

function ReviewCard({ review, gbpConnected, preDraft, voiceMode }: { review: ReviewItem; gbpConnected: boolean; preDraft?: PreDraft; voiceMode: ReplyVoice["mode"] }) {
  const { dashboardHref, readOnly } = useDashboard();
  // Seed the draft from an already-written reply: a saved one, or the AI reply
  // Strelva pre-drafted (so the card opens with "here's your reply", not a to-do).
  const [draft, setDraft] = useState<string | null>(review.reply ?? preDraft?.reply ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Locally track the saved reply so the card can flip to the locked "Your
  // reply" state right after a save without waiting for a full page refresh.
  const [savedReply, setSavedReply] = useState<{ reply: string; repliedAt?: string; published?: boolean } | null>(
    review.reply ? { reply: review.reply, repliedAt: review.repliedAt } : null,
  );

  const hasExistingReply = Boolean(savedReply);
  // Google reviews publish straight to the listing through the governed
  // approval path when GBP is connected; everything else stays copy-paste.
  const canPublish = gbpConnected && review.source === "google" && Boolean(review.externalId);

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
      const data = (await res.json()) as { review?: ReviewItem; published?: boolean };
      const saved = data.review;
      setSavedReply({
        reply: saved?.reply ?? draft,
        repliedAt: saved?.repliedAt,
        published: data.published === true,
      });
    } catch {
      setError(
        canPublish
          ? "Couldn't publish to Google. Nothing was posted. Try again."
          : "Could not save the reply. Try again.",
      );
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
        <span className="shrink-0 rounded-md border border-glass-border bg-glass px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-muted">
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
          {savedReply?.published && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-accent">
              <Check className="h-3 w-3" strokeWidth={2} />
              Published to your Google listing
            </p>
          )}
          {savedReply?.repliedAt && (
            <p className="mt-2 text-[11px] text-gray-muted">Replied {formatDate(savedReply.repliedAt)}</p>
          )}
        </div>
      ) : draft ? (
        <div className="mt-4">
          {preDraft && !hasExistingReply ? (
            <div className="mb-2 rounded-lg bg-accent-dim px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} /> Strelva already drafted this reply
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-warm-black/80">
                {preDraft.autoPostAt
                  ? `It posts to Google ${untilLabel(preDraft.autoPostAt)} in your voice. Edit it here first if you want.`
                  : "Written in your voice. Approve to post, or edit it first."}
              </p>
            </div>
          ) : (
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
              Drafted reply
            </p>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full min-h-[96px] resize-y rounded-lg border border-glass-border bg-surface-base px-3 py-2 text-[13px] leading-relaxed text-warm-black outline-none transition-colors focus:border-accent"
            aria-label="Edit drafted reply"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {canPublish && !readOnly ? (
              <button
                type="button"
                onClick={saveReply}
                disabled={saving}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Reply on Google
                  </>
                )}
              </button>
            ) : (
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
            )}
            {!canPublish && !readOnly && (
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
      ) : voiceMode !== "off" ? (
        // Replies are on — this one just hasn't been drafted yet (Strelva catches
        // the backlog up on a schedule). Read as "handled", not a to-do; the
        // impatient can still draft it now.
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-muted">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.6} />
          <span>Strelva is writing a reply in your voice &mdash; it&rsquo;ll appear here shortly.</span>
          {!readOnly && (
            <button
              type="button"
              onClick={generateDraft}
              disabled={loading}
              className="font-medium text-accent transition-opacity hover:underline disabled:opacity-50"
            >
              {loading ? "drafting…" : "draft it now"}
            </button>
          )}
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

      {error && <p className="mt-2 text-[12px] text-critical">{error}</p>}
    </div>
  );
}

export function ReviewsPanel({ reviews, googlePlaceId, gbpConnected = false, voice, preDrafts }: ReviewsPanelProps) {
  const { dashboardHref } = useDashboard();
  // Positive, client-facing summary only — the owner sees good numbers as good
  // numbers. Concerns / the response queue live admin-side (reviews-intel API).
  const copyDest = copyDestination(reviews);
  const connectHref = dashboardHref("/dashboard/sources/google-business");
  if (reviews.length === 0) {
    return (
      <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
              Reviews
            </p>
            <h1 className="font-display text-[26px] leading-tight tracking-[-0.01em] text-warm-black sm:text-[32px]">
              Let&apos;s get your reviews flowing.
            </h1>
          </div>
          {googlePlaceId && <ReviewRequestCard placeId={googlePlaceId} connectHref={connectHref} />}
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl dashboard-panel p-8 text-center">
            <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-glass-border bg-glass text-accent-text">
              <div
                aria-hidden
                className="absolute inset-0 rounded-2xl opacity-60"
                style={{ background: "radial-gradient(circle at 50% 35%, var(--color-accent-dim), transparent 70%)" }}
              />
              <MessageSquare className="relative h-5 w-5" strokeWidth={1.5} />
            </div>
            <p className="font-display text-[19px] leading-tight text-warm-black">
              Connect Google to bring your reviews in
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-gray-muted">
              Once your Google Business Profile is connected, your reviews show up here and Strelva
              can draft a reply for each one.
            </p>
            <Link
              href={dashboardHref("/dashboard/sources/google-business")}
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
        <ReputationHeader reviews={reviews} gbpConnected={gbpConnected} copyDest={copyDest} />

        <ReplyVoicePanel initialVoice={voice} />

        <ReviewRequestCard placeId={googlePlaceId} connectHref={connectHref} />

        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              gbpConnected={gbpConnected}
              preDraft={preDrafts[review.externalId ?? review.id]}
              voiceMode={voice.mode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
