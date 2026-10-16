"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { XaField, XaTextArea, XaYes } from "@/components/ui/strelva/Xa";
import { useDashboardOptional } from "./DashboardContext";

interface ReviewData {
  id: string;
  author: string;
  text: string;
  source: string;
  rating: number;
}

interface UseAsTestimonialProps {
  onClose: () => void;
  review: ReviewData | null;
  onSuccess?: () => void;
}

/**
 * Putting a review on the site, asked in place inside the open decision
 * (October 16: no sheet over the page). The words are editable right here,
 * then the one yes adds it.
 */
export function UseAsTestimonial({
  onClose,
  review,
  onSuccess,
}: UseAsTestimonialProps) {
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
      setError("Add the quote and the name first.");
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
      setError(err instanceof Error && err.message !== "Failed to save testimonial" ? err.message : "It didn't save. Nothing changed on your site.");
    } finally {
      setSaving(false);
    }
  }, [dashboardHref, quote, author, location, review, onClose, onSuccess]);

  if (!review) return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[14px] text-[var(--st-text-2)]">
        From {review.source === "google" ? "Google" : review.source === "yelp" ? "Yelp" : review.source}, {review.rating} {review.rating === 1 ? "star" : "stars"}. Change the words before it goes up if you want.
      </p>
      <XaTextArea label="Quote" value={quote} rows={4} onChange={(e) => setQuote(e.target.value)} placeholder="What they said" />
      <XaField label="Name" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Customer name" />
      <XaField label="Where it came from" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="via Google" error={error ?? undefined} />
      {saved ? <p className="m-0 text-[15px] text-[var(--st-text-body)]" role="status">Added to the reviews on your site.</p> : <XaYes
        state="waiting"
        question="Put this review on your site?"
        yesLabel="Add it to your site"
        notYetLabel="Not yet"
        onYes={() => void handleSave()}
        onNotYet={onClose}
        disabled={saving}
        block={false}
      />}
    </div>
  );
}
