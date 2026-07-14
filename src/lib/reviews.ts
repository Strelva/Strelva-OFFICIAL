import { promises as fs } from "fs";
import path from "path";
import type { ReviewItem } from "./types";
import { dataSourceIsPostgres } from "./db/source-flags";
import { getSupabase } from "./db/client";
import type { Row, Insert } from "./db/client";

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

// --- Authoritative Postgres (reviews table) helpers. When
// DATA_SOURCE=postgres the review id IS the Postgres row uuid, so getReviews and
// replyToReview share one id space (the dashboard passes the id straight through).
function reviewDb(operation: string): NonNullable<ReturnType<typeof getSupabase>> {
  const db = getSupabase();
  if (!db) throw new Error(`[reviews] ${operation} failed: Supabase is not configured`);
  return db;
}

function rowToReview(r: Row<"reviews">): ReviewItem {
  return {
    id: r.id,
    source: r.source as ReviewItem["source"],
    author: r.author,
    rating: r.rating ?? 0,
    text: r.text,
    date: r.review_date ?? r.created_at,
    reply: r.reply ?? undefined,
    repliedAt: r.replied_at ?? undefined,
    externalId: r.external_id ?? undefined,
  };
}

async function pgListReviews(tenant: string): Promise<ReviewItem[]> {
  const db = reviewDb(`list ${tenant}`);
  const { data, error } = await db
    .from("reviews")
    .select("*")
    .eq("tenant_id", tenant)
    .order("review_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToReview);
}

async function pgInsertReview(tenant: string, review: Omit<ReviewItem, "id">): Promise<ReviewItem> {
  const db = reviewDb(`insert ${tenant}`);
  const insert: Insert<"reviews"> = {
    tenant_id: tenant,
    source: review.source,
    author: review.author,
    rating: review.rating,
    text: review.text,
    review_date: review.date,
    reply: review.reply ?? null,
    replied_at: review.repliedAt ?? null,
    external_id: review.externalId ?? null,
  };
  // Ignore an already-mirrored provider review so a re-poll cannot overwrite a
  // reply. When the conflict returns no row, read the existing canonical row.
  const { data, error } = await db
    .from("reviews")
    .upsert(insert, { onConflict: "tenant_id,source,external_id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) return rowToReview(data);
  if (review.externalId) {
    const { data: existing, error: existingError } = await db
      .from("reviews")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("source", review.source)
      .eq("external_id", review.externalId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return rowToReview(existing);
  }
  throw new Error(`[reviews] insert ${tenant} returned no persisted row`);
}

async function pgReplyToReview(tenant: string, id: string, reply: string, repliedAt: string): Promise<ReviewItem | null> {
  const db = reviewDb(`reply ${tenant}/${id}`);
  const { data, error } = await db
    .from("reviews")
    .update({ reply, replied_at: repliedAt })
    .eq("tenant_id", tenant)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToReview(data) : null;
}

export async function getReviews(tenant: string): Promise<ReviewItem[]> {
  if (dataSourceIsPostgres()) {
    const pg = await pgListReviews(tenant);
    return pg;
  }

  const reviews = await readDevReviews(tenant);
  reviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return reviews;
}

export async function addReview(
  tenant: string,
  review: Omit<ReviewItem, "id">,
): Promise<ReviewItem> {
  // Postgres is the id space when the flag is on (the row uuid). Insert there
  // first so the returned id matches what getReviews/replyToReview will use.
  if (dataSourceIsPostgres()) {
    return pgInsertReview(tenant, review);
  }

  if (!dataSourceIsPostgres()) {
    const id = generateId();
    const newReview: ReviewItem = { ...review, id };
    const reviews = await readDevReviews(tenant);
    reviews.push(newReview);
    await writeDevReviews(tenant, reviews);
    return newReview;
  }

  throw new Error("Unreachable review persistence branch");
}

export async function replyToReview(
  tenant: string,
  reviewId: string,
  replyText: string,
): Promise<ReviewItem | null> {
  const repliedAt = new Date().toISOString();

  if (dataSourceIsPostgres()) {
    const updated = await pgReplyToReview(tenant, reviewId, replyText, repliedAt);
    if (updated) return updated;
    return null;
  }

  const reviews = await readDevReviews(tenant);
  const idx = reviews.findIndex((r) => r.id === reviewId);
  if (idx === -1) return null;

  reviews[idx] = { ...reviews[idx], reply: replyText, repliedAt };
  await writeDevReviews(tenant, reviews);
  return reviews[idx];
}
