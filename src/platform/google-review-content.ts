/** GBP API cache only. Customer replies/decisions are independent records. */
export const GOOGLE_REVIEW_CACHE_MS = 29 * 24 * 60 * 60 * 1000;
export type GoogleReviewContent = { source: "google_business_profile_api"; fetchedAt: string; expiresAt: string };
export function googleReviewContent(now = new Date()): GoogleReviewContent {
  return { source: "google_business_profile_api", fetchedAt: now.toISOString(), expiresAt: new Date(now.getTime() + GOOGLE_REVIEW_CACHE_MS).toISOString() };
}
export function googleReviewContentLive(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<GoogleReviewContent>;
  const fetched = Date.parse(v.fetchedAt ?? ""), expires = Date.parse(v.expiresAt ?? "");
  return v.source === "google_business_profile_api" && Number.isFinite(fetched) && fetched <= now && expires > now && expires > fetched && expires <= fetched + GOOGLE_REVIEW_CACHE_MS;
}
/** Missing provenance never establishes that Google cache is current. */
export function projectGoogleReview<T extends { source: string; author?: unknown; rating?: unknown; text?: unknown; date?: unknown; review_date?: unknown; providerContent?: unknown; provider_content?: unknown }>(row: T, now = Date.now()): T {
  if (row.source !== "google" || googleReviewContentLive(row.providerContent ?? row.provider_content, now)) return row;
  return { ...row, author: "", rating: null, text: "", ...(row.date !== undefined ? { date: "" } : {}), ...(row.review_date !== undefined ? { review_date: null } : {}) };
}
/** Do not copy the original comment into reply proposals. Preserve authored reply,
 * execution, decisions and IDs when cached author/rating/context expire. */
export function projectGoogleReviewEvent<T extends { source: string; type: string; title?: unknown; body?: unknown; metadata?: unknown }>(event: T, now = Date.now()): T {
  const m = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : null;
  const raw = event.source === "google" && event.type === "review";
  const draft = event.type === "review" && m?.kind === "review_reply_draft" && (m?.providerContent !== undefined || m?.reviewId !== undefined);
  if ((!raw && !draft) || googleReviewContentLive(m?.providerContent, now)) return event;
  const metadata = { ...m };
  for (const key of ["author", "rating", "createdAt", "reviewCreatedAt", "review", "comment", "text", "reviewer"]) delete metadata[key];
  metadata.providerContentExpired = true;
  return { ...event, title: raw ? "Google review (cached content expired)" : "Review reply draft", ...(raw ? { body: "" } : {}), metadata };
}
/** Export backstop: native SQL projects reviews too; recursively covers nested
 * legacy event objects without granting arbitrary provenance to unknown rows. */
export function projectGoogleReviewExport(value: unknown, now = Date.now()): unknown {
  if (Array.isArray(value)) return value.map(item => projectGoogleReviewExport(item, now));
  if (!value || typeof value !== "object") return value;
  let row = value as Record<string, unknown>;
  if (typeof row.source === "string" && typeof row.type === "string") row = projectGoogleReviewEvent(row as typeof row & { source: string; type: string }, now);
  else if (row.source === "google" && "text" in row) row = projectGoogleReview(row as typeof row & { source: string }, now);
  return Object.fromEntries(Object.entries(row).map(([key, item]) => [key, projectGoogleReviewExport(item, now)]));
}
