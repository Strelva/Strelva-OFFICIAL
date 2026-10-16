"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { XaButton, XaField, XaSheet, XaTextArea } from "@/components/ui/strelva/Xa";
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

  // A sheet: adding a review to the site is a change that deserves its own moment.
  return (
    <XaSheet
      open={open}
      onClose={onClose}
      title="Put this review on your site?"
      actions={<>
        <XaButton variant="primary" size="lg" block busy={saving} disabled={saved} onClick={handleSave}>{saved ? "Added to your reviews" : "Add it to your site"}</XaButton>
        <XaButton variant="quiet" size="lg" onClick={onClose}>Cancel</XaButton>
      </>}
    >
      <p className="m-0 text-[14px] text-[var(--st-text-2)]">
        From {review.source === "google" ? "Google" : review.source === "yelp" ? "Yelp" : review.source}, {review.rating} {review.rating === 1 ? "star" : "stars"}. Change the words before it goes up if you want.
      </p>
      <div className="flex flex-col gap-4">
        <XaTextArea label="Quote" value={quote} rows={4} onChange={(e) => setQuote(e.target.value)} placeholder="What they said" />
        <XaField label="Name" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Customer name" />
        <XaField label="Where it came from" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="via Google" error={error ?? undefined} />
      </div>
    </XaSheet>
  );
}
