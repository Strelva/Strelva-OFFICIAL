import { promises as fs } from "fs";
import path from "path";
import type { ReviewItem } from "./types";
import { getSanityClient, getSanityReadClient } from "./sanity";

const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;

function devReviewsPath(tenant: string): string {
  return path.join(process.cwd(), `dev-reviews-${tenant}.json`);
}

async function readDevReviews(tenant: string): Promise<ReviewItem[]> {
  try {
    const raw = await fs.readFile(devReviewsPath(tenant), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeDevReviews(tenant: string, reviews: ReviewItem[]): Promise<void> {
  await fs.writeFile(devReviewsPath(tenant), JSON.stringify(reviews, null, 2));
}

function generateId(): string {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getReviews(tenant: string): Promise<ReviewItem[]> {
  if (hasSanity) {
    return getSanityReadClient().fetch(
      `*[_type == "review" && tenant == $tenant] | order(date desc) {
        "id": _id, source, author, rating, text, date, reply, repliedAt
      }`,
      { tenant },
    );
  }

  const reviews = await readDevReviews(tenant);
  reviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return reviews;
}

export async function addReview(
  tenant: string,
  review: Omit<ReviewItem, "id">,
): Promise<ReviewItem> {
  const id = generateId();
  const newReview: ReviewItem = { ...review, id };

  if (hasSanity) {
    await getSanityClient().create({
      _type: "review",
      tenant,
      source: review.source,
      author: review.author,
      rating: review.rating,
      text: review.text,
      date: review.date,
      reply: review.reply,
      repliedAt: review.repliedAt,
    });
    return newReview;
  }

  const reviews = await readDevReviews(tenant);
  reviews.push(newReview);
  await writeDevReviews(tenant, reviews);
  return newReview;
}

export async function replyToReview(
  tenant: string,
  reviewId: string,
  replyText: string,
): Promise<ReviewItem | null> {
  const repliedAt = new Date().toISOString();

  if (hasSanity) {
    const query = `*[_type == "review" && tenant == $tenant && _id == $reviewId][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant, reviewId });
    if (!existingId) return null;

    await getSanityClient().patch(existingId).set({ reply: replyText, repliedAt }).commit();

    const updated = await getSanityReadClient().fetch(
      `*[_type == "review" && _id == $reviewId][0]{
        "id": _id, source, author, rating, text, date, reply, repliedAt
      }`,
      { reviewId },
    );
    return updated || null;
  }

  const reviews = await readDevReviews(tenant);
  const idx = reviews.findIndex((r) => r.id === reviewId);
  if (idx === -1) return null;

  reviews[idx] = { ...reviews[idx], reply: replyText, repliedAt };
  await writeDevReviews(tenant, reviews);
  return reviews[idx];
}
