import { promises as fs } from "fs";
import path from "path";
import type { ReviewItem } from "./types";
import { getSanityClient, getSanityReadClient } from "./sanity";
import { dataSourceIsPostgres } from "./db/source-flags";
import { getSupabase } from "./db/client";
import type { Row, Insert } from "./db/client";

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

// --- Postgres (reviews table) helpers — self-contained, never throw. When
// DATA_SOURCE=postgres the review id IS the Postgres row uuid, so getReviews and
// replyToReview share one id space (the dashboard passes the id straight through).
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
  };
}

async function pgListReviews(tenant: string): Promise<ReviewItem[]> {
  const db = getSupabase();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("reviews")
      .select("*")
      .eq("tenant_id", tenant)
      .order("review_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToReview);
  } catch (err) {
    console.error(`[db] pgListReviews ${tenant} failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function pgInsertReview(tenant: string, review: Omit<ReviewItem, "id">): Promise<ReviewItem | null> {
  const db = getSupabase();
  if (!db) return null;
  try {
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
    // Upsert on the provider id so a re-poll (e.g. after the 30-day Redis dedup
    // cache expires) can't insert duplicate rows. ignoreDuplicates keeps the
    // existing row, preserving any reply. Manual reviews have a null external_id
    // (NULLs are distinct under the unique key), so they always insert, as before.
    const { data, error } = await db
      .from("reviews")
      .upsert(insert, { onConflict: "tenant_id,source,external_id", ignoreDuplicates: true })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToReview(data) : null;
  } catch (err) {
    console.error(`[db] pgInsertReview ${tenant} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function pgReplyToReview(tenant: string, id: string, reply: string, repliedAt: string): Promise<ReviewItem | null> {
  const db = getSupabase();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("reviews")
      .update({ reply, replied_at: repliedAt })
      .eq("tenant_id", tenant)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToReview(data) : null;
  } catch (err) {
    console.error(`[db] pgReplyToReview ${tenant}/${id} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getReviews(tenant: string): Promise<ReviewItem[]> {
  if (dataSourceIsPostgres()) {
    const pg = await pgListReviews(tenant);
    if (pg.length > 0 || !hasSanity) return pg;
    // fall through to Sanity only if Postgres is empty and Sanity still configured
  }

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
  // Postgres is the id space when the flag is on (the row uuid). Insert there
  // first so the returned id matches what getReviews/replyToReview will use.
  let result: ReviewItem | null = null;
  if (dataSourceIsPostgres()) {
    result = await pgInsertReview(tenant, review);
  }

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
  } else if (!dataSourceIsPostgres()) {
    const id = generateId();
    const newReview: ReviewItem = { ...review, id };
    const reviews = await readDevReviews(tenant);
    reviews.push(newReview);
    await writeDevReviews(tenant, reviews);
    return newReview;
  }

  return result ?? { ...review, id: generateId() };
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
    if (!hasSanity) return null;
    // a uuid not in Postgres -> fall through to Sanity (legacy _id during transition)
  }

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
