"use client";

import { useState, useEffect } from "react";
import { Star, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { CapabilityGate } from "@/components/dashboard/CapabilityGate";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface ReviewItem {
  id: string;
  source: "google" | "yelp" | "manual";
  author: string;
  rating: number;
  text: string;
  date: string;
  reply?: string;
  repliedAt?: string;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i <= rating ? "text-amber-400 fill-amber-400" : "text-gray-border"
          }`}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  yelp: "Yelp",
  manual: "Manual",
};

function ReviewsContent() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setChatPrompt } = useDashboard();

  useEffect(() => {
    fetchReviews();
  }, []);

  async function fetchReviews() {
    try {
      const res = await fetch("/api/reviews");
      if (res.ok) {
        const data = await res.json();
        setReviews(data);
      }
    } catch {
      setError("Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
  const repliedCount = reviews.filter((r) => r.reply).length;
  const unrepliedCount = reviews.length - repliedCount;

  if (loading) {
    return (
      <div className="p-6 md:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto space-y-4">
        <SkeletonLine width="w-48" height="h-8" />
        <SkeletonLine width="w-full" height="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-warm-black tracking-tight">Reviews</h1>
        <p className="text-sm text-gray-muted mt-1">Monitor and respond to customer reviews</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-600/5 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {reviews.length === 0 ? (
        <EmptyState
          icon={<Star className="w-5 h-5 text-gray-muted" strokeWidth={1.5} />}
          title="No reviews yet"
          description="Reviews will appear here once imported or synced from Google or Yelp."
          className="py-16"
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold text-warm-black">
                  {avgRating.toFixed(1)}
                </p>
                <Stars rating={Math.round(avgRating)} />
              </div>
              <p className="text-xs text-gray-muted mt-1">Average rating</p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold text-warm-black">{reviews.length}</p>
              <p className="text-xs text-gray-muted mt-1">Total reviews</p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold text-warm-black">{unrepliedCount}</p>
              <p className="text-xs text-gray-muted mt-1">Needs reply</p>
            </Card>
          </div>

          {/* Review list */}
          <div className="space-y-2">
            {reviews.map((review) => (
              <Card key={review.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-warm-black truncate">
                        {review.author}
                      </span>
                      <Badge
                        variant={
                          review.source === "google"
                            ? "sage"
                            : review.source === "yelp"
                              ? "red"
                              : "neutral"
                        }
                      >
                        {SOURCE_LABELS[review.source] || review.source}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Stars rating={review.rating} />
                      <span className="text-xs text-gray-muted">{formatDate(review.date)}</span>
                    </div>
                    <p className="text-[13px] text-gray-muted leading-relaxed">{review.text}</p>
                  </div>
                </div>

                {/* Reply section */}
                {review.reply ? (
                  <div className="ml-4 pl-3 border-l-2 border-sage/30">
                    <p className="text-[12px] font-medium text-sage mb-0.5">Your reply</p>
                    <p className="text-[12px] text-gray-muted leading-relaxed">{review.reply}</p>
                    {review.repliedAt && (
                      <p className="text-[11px] text-gray-subtle mt-1">
                        {formatDate(review.repliedAt)}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setChatPrompt(
                        `Write a reply to ${review.author}'s ${review.rating}-star review: "${review.text.slice(0, 120)}${review.text.length > 120 ? "..." : ""}"`
                      )
                    }
                    className="flex items-center gap-1.5 self-start text-[12px] font-medium text-sage hover:text-sage/80 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Reply with AI
                  </button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <CapabilityGate capability="reviews">
      <ReviewsContent />
    </CapabilityGate>
  );
}
