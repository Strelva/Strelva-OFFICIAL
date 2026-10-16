"use client";

import { useState } from "react";
import { XaButton, XaLabel, XaTextArea, XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { DashEmpty, dashStyles as dash } from "./xa/DashboardXa";
import styles from "./reviews.module.css";
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

/** A copy text link with a "Copied" flip; the text itself stays visible to select. */
function CopyLink({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The text stays on screen to copy by hand.
    }
  };
  return <XaTextLink onClick={copy}>{copied ? "Copied" : label}</XaTextLink>;
}

/**
 * The one-tap "get more reviews" action: a ready-to-send message plus the raw
 * Google review link. With no Google listing connected there is no link to
 * fake, so it says how to get one instead of showing a dead URL.
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
      <section className={styles.section} aria-labelledby="review-request">
        <XaLabel id="review-request">Get more reviews</XaLabel>
        <p className={styles.prose}>Connect your Google listing to share a review link with happy patients. More reviews is the strongest thing you can do for your reputation.</p>
        <p className={styles.links}><XaTextLink href={connectHref}>Connect your Google listing</XaTextLink></p>
      </section>
    );
  }

  const message = buildReviewShareMessage(url);
  return (
    <section className={styles.section} aria-labelledby="review-request">
      <XaLabel id="review-request">Get more reviews</XaLabel>
      <p className={styles.prose}>Send a happy customer this message. The link opens straight to your Google review form.</p>
      <blockquote className={styles.quote}>{message}</blockquote>
      <p className={styles.links}>
        <CopyLink text={message} label="Copy message" /> · <CopyLink text={url} label="Copy link" /> · <a className={styles.url} href={url} target="_blank" rel="noopener noreferrer">{url}</a>
      </p>
    </section>
  );
}

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(Math.min(5, Math.max(0, rating)));
  return <span className={styles.stars} aria-label={`${filled} out of 5 stars`}><span aria-hidden="true">{"★".repeat(filled)}<span className={styles.starsOff}>{"★".repeat(5 - filled)}</span></span></span>;
}

function formatDate(date: string): string {
  const d = new Date(date.length <= 10 ? date + "T00:00:00" : date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sourceLabel(source: ReviewItem["source"]): string {
  if (source === "google") return "Google";
  if (source === "yelp") return "Yelp";
  return "Added by hand";
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

/** "in about 8 hours" / "shortly": a soft countdown to an auto-post. Client-only. */
function untilLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "shortly";
  const h = Math.round(ms / 3_600_000);
  if (h >= 1) return `in about ${h} ${h === 1 ? "hour" : "hours"}`;
  return `in about ${Math.max(1, Math.round(ms / 60_000))} minutes`;
}

function ReviewCard({ review, gbpConnected, preDraft, voiceMode, open, onOpen }: { review: ReviewItem; gbpConnected: boolean; preDraft?: PreDraft; voiceMode: ReplyVoice["mode"]; open: boolean; onOpen: (open: boolean) => void }) {
  const { dashboardHref, readOnly } = useDashboard();
  const [draft, setDraft] = useState<string | null>(review.reply ?? preDraft?.reply ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedReply, setSavedReply] = useState<{ reply: string; repliedAt?: string; published?: boolean } | null>(
    review.reply ? { reply: review.reply, repliedAt: review.repliedAt } : null,
  );

  const hasExistingReply = Boolean(savedReply);
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
      onOpen(true);
    } catch {
      setError("Strelva couldn't write a reply just now. Try again.");
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
      setError("Couldn't copy. Select the text and copy it by hand.");
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
          ? "Couldn't post to Google. Nothing was posted. Try again."
          : "Couldn't save the reply. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const status = hasExistingReply
    ? (savedReply?.published ? "Replied on Google" : savedReply?.repliedAt ? `Replied ${formatDate(savedReply.repliedAt)}` : "Replied")
    : draft ? (preDraft?.autoPostAt ? `Reply posts ${untilLabel(preDraft.autoPostAt)}` : "Reply waits for you")
      : voiceMode !== "off" ? "Strelva is writing a reply" : "No reply yet";

  return (
    <li className={styles.review} data-open={open || undefined}>
      <button type="button" className={styles.reviewHead} aria-expanded={open} onClick={() => onOpen(!open)}>
        <span className={styles.who}>
          <span className={styles.author}>{review.author}</span>
          <span className={styles.meta}><Stars rating={review.rating} /> · {formatDate(review.date)} · {sourceLabel(review.source)}</span>
        </span>
        <span className={styles.state} data-tone={!hasExistingReply && draft ? "waits" : undefined}>{status}</span>
      </button>
      {review.text ? <p className={styles.text}>{review.text}</p> : null}

      {open ? (
        <div className={styles.reply}>
          {hasExistingReply && !loading ? (
            <>
              <XaLabel>Your reply</XaLabel>
              <p className={styles.replyText}>{savedReply?.reply}</p>
              {savedReply?.published ? <p className={styles.settled}>Posted to your Google listing.</p> : null}
            </>
          ) : draft ? (
            <>
              <XaTextArea
                label={preDraft && !hasExistingReply ? "Strelva already wrote this reply in your voice" : "Reply in your voice"}
                hint={preDraft?.autoPostAt ? `It posts to Google ${untilLabel(preDraft.autoPostAt)}. Change it here first if you want.` : canPublish ? "Your yes posts it to your Google listing." : `Save it here, then copy it into ${review.source === "yelp" ? "Yelp" : review.source === "google" ? "Google" : "the platform"}.`}
                value={draft}
                rows={4}
                onChange={(e) => setDraft(e.target.value)}
                readOnly={readOnly}
              />
              {canPublish && !readOnly ? (
                <XaYes state={saving ? "going" : "waiting"} yesLabel="Post the reply on Google" onYes={saveReply} onNotYet={() => onOpen(false)} block={false} shortcut={false} />
              ) : (
                <div className={styles.actions}>
                  <XaButton onClick={copyDraft}>{copied ? "Copied" : "Copy reply"}</XaButton>
                  {!readOnly ? <XaButton variant="quiet" busy={saving} onClick={saveReply}>Save reply</XaButton> : null}
                </div>
              )}
              {!readOnly ? <p className={styles.links}><XaTextLink onClick={generateDraft}>{loading ? "Writing a new one" : "Write it again"}</XaTextLink></p> : null}
            </>
          ) : (
            <div className={styles.actions}>
              <XaButton busy={loading} disabled={readOnly} onClick={generateDraft}>{voiceMode !== "off" ? "Write it now" : "Write a reply"}</XaButton>
            </div>
          )}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export function ReviewsPanel({ reviews, googlePlaceId, gbpConnected = false, voice, preDrafts }: ReviewsPanelProps) {
  const { dashboardHref } = useDashboard();
  // Positive, client-facing summary only. Concerns and the response queue live admin-side.
  const copyDest = copyDestination(reviews);
  const connectHref = dashboardHref("/dashboard/sources/google-business");
  const firstWaiting = reviews.find((review) => !review.reply)?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(firstWaiting);

  if (reviews.length === 0) {
    return (
      <DashEmpty
        pose="alone"
        title="No reviews here yet."
        job={gbpConnected ? "Watching your Google listing for the first review" : "Waiting for your Google listing to be connected"}
        action={!gbpConnected ? <XaTextLink href={connectHref}>Connect your Google listing</XaTextLink> : undefined}
      >
        Once your Google listing is connected, reviews show up here and Strelva writes a reply for each one in your voice.
      </DashEmpty>
    );
  }

  return (
    <div className={dash.scroll} aria-label="Reviews"><div className={dash.page}><div className={dash.column}>
      <ReputationHeader reviews={reviews} gbpConnected={gbpConnected} copyDest={copyDest} />
      <ul className={styles.reviews} aria-label="Reviews">
        {reviews.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            gbpConnected={gbpConnected}
            preDraft={preDrafts[review.externalId ?? review.id]}
            voiceMode={voice.mode}
            open={openId === review.id}
            onOpen={(next) => setOpenId(next ? review.id : null)}
          />
        ))}
      </ul>
      <ReviewRequestCard placeId={googlePlaceId} connectHref={connectHref} />
      <ReplyVoicePanel initialVoice={voice} />
    </div></div></div>
  );
}
