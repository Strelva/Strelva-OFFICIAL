/** GBP API cache only. Customer replies/decisions are independent records. */
export const GOOGLE_REVIEW_CACHE_MS = 29 * 24 * 60 * 60 * 1000;
export type CustomerImportedReview = { source: "customer_import"; producer: "authenticated_reviews_post" | "legacy_reviews_post_no_external_id" };
export type ReviewContentProvenance = GoogleReviewContent | CustomerImportedReview;
export function customerImportedReview(): CustomerImportedReview { return { source: "customer_import", producer: "authenticated_reviews_post" }; }
export function customerImportedReviewContent(value: unknown, externalId: unknown): boolean {
  if (externalId !== undefined && externalId !== null) return false;
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<CustomerImportedReview>;
  return v.source === "customer_import" && ["authenticated_reviews_post", "legacy_reviews_post_no_external_id"].includes(v.producer ?? "");
}
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
export function projectGoogleReview<T extends { source: string; author?: unknown; rating?: unknown; text?: unknown; date?: unknown; review_date?: unknown; providerContent?: unknown; provider_content?: unknown; externalId?: unknown; external_id?: unknown }>(row: T, now = Date.now()): T {
  const provenance = row.providerContent ?? row.provider_content;
  if (row.source !== "google" || customerImportedReviewContent(provenance, row.externalId ?? row.external_id) || googleReviewContentLive(provenance, now)) return row;
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

/** The original cache clock follows stored archive bytes, never the build date. */
export function googleReviewArchiveDeadline(value: unknown, now = Date.now()): number | null {
  if (Array.isArray(value)) {
    const clocks = value.map(item => googleReviewArchiveDeadline(item, now)).filter((clock): clock is number => clock !== null);
    return clocks.length ? Math.min(...clocks) : null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  const cachedRow = row.source === "google" && (Boolean(row.text) || Boolean(row.author) || typeof row.rating === "number" && row.rating > 0 || Boolean(row.review_date));
  const cachedEvent = row.type === "review" && (row.source === "google" || metadata.kind === "review_reply_draft") && (Boolean(metadata.author) || typeof metadata.rating === "number" && metadata.rating > 0 || Boolean(metadata.review) || (row.source === "google" && Boolean(row.body)));
  let deadline: number | null = null;
  if (cachedRow && !customerImportedReviewContent(row.providerContent ?? row.provider_content, row.externalId ?? row.external_id) || cachedEvent) {
    const provenance = cachedEvent ? metadata.providerContent : row.providerContent ?? row.provider_content;
    deadline = googleReviewContentLive(provenance, now) ? Date.parse((provenance as GoogleReviewContent).expiresAt) : 0;
  }
  for (const item of Object.values(row)) {
    const nested = googleReviewArchiveDeadline(item, now);
    if (nested !== null) deadline = deadline === null ? nested : Math.min(deadline, nested);
  }
  return deadline;
}
export function assertGoogleReviewArchiveCurrent(body: string, now = Date.now()): void {
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new Error("This export must be rebuilt before download."); }
  const deadline = googleReviewArchiveDeadline(value, now);
  if (deadline !== null && deadline <= now) throw new Error("This export must be rebuilt: its Google review cache expired or has no provenance.");
}
