import type { GoogleHours, GoogleInfo } from "./contracts";

/**
 * The Google calls the listing System makes. One interface so the service is
 * proven against a fake and the HTTP version stays thin. Endpoints:
 *  - reviews: My Business v4 accounts.locations.reviews (list, get, updateReply, deleteReply)
 *  - location: Business Information v1 locations (get with readMask, patch with updateMask)
 *  - posts: My Business v4 accounts.locations.localPosts (create, get, delete)
 * No method retries a write.
 */

export type GoogleFailureKind = "setup_pending" | "auth" | "rate_limited" | "not_found" | "error";
export type GoogleResult<T> = { ok: true; data: T } | { ok: false; kind: GoogleFailureKind; status: number; detail: string };

export interface GoogleReview {
  reviewId: string;
  reviewer?: { displayName?: string };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE" | "STAR_RATING_UNSPECIFIED";
  comment?: string;
  createTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

export interface GoogleLocationState extends GoogleHours, GoogleInfo {
  title?: string;
  metadata?: { hasPendingEdits?: boolean; hasVoiceOfMerchant?: boolean };
}

export interface GooglePost {
  name: string;
  summary?: string;
  topicType?: string;
  state?: "LOCAL_POST_STATE_UNSPECIFIED" | "REJECTED" | "LIVE" | "PROCESSING";
}

export interface GoogleLocationRef { accountId: string; locationId: string }

export interface GoogleListingClient {
  listReviews(location: GoogleLocationRef, pageToken?: string): Promise<GoogleResult<{ reviews: GoogleReview[]; nextPageToken?: string }>>;
  getReview(location: GoogleLocationRef, reviewId: string): Promise<GoogleResult<GoogleReview>>;
  updateReply(location: GoogleLocationRef, reviewId: string, comment: string): Promise<GoogleResult<{ comment?: string }>>;
  deleteReply(location: GoogleLocationRef, reviewId: string): Promise<GoogleResult<null>>;
  getLocation(location: GoogleLocationRef, readMask: string[]): Promise<GoogleResult<GoogleLocationState>>;
  patchLocation(location: GoogleLocationRef, updateMask: string[], body: Record<string, unknown>): Promise<GoogleResult<GoogleLocationState>>;
  createPost(location: GoogleLocationRef, post: Record<string, unknown>): Promise<GoogleResult<GooglePost>>;
  getPost(postName: string): Promise<GoogleResult<GooglePost>>;
  deletePost(postName: string): Promise<GoogleResult<null>>;
}

/** Same reading as gbp-management's isSetupPendingError: quota 0 or the API
 * not enabled is "access pending", not a failure the owner must fix. */
export function classifyGoogleFailure(status: number, body: string): GoogleFailureKind {
  const lower = body.toLowerCase();
  if ((status === 403 || status === 429) && (["accessnotconfigured", "service_disabled", "has not been used in project", "quota limit: 0", "limit of 0", "quota of 0", "quota is 0"].some((needle) => lower.includes(needle)) || /"quota_limit_value"\s*:\s*"?0"?(?=\s*[,}])/.test(lower))) {
    return "setup_pending";
  }
  if (status === 429 || lower.includes("resource_exhausted")) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  return "error";
}

const V4 = "https://mybusiness.googleapis.com/v4";
const V1 = "https://mybusinessbusinessinformation.googleapis.com/v1";

function accountPath(accountId: string): string {
  return accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`;
}
function locationPath(location: GoogleLocationRef): string {
  return `${accountPath(location.accountId)}/locations/${encodeURIComponent(location.locationId)}`;
}
function safePostName(name: string): string {
  if (!/^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+\/localPosts\/[A-Za-z0-9_-]+$/.test(name)) throw new Error("google_post_name_invalid");
  return name;
}

export function createHttpGoogleListingClient(accessToken: string, fetchImpl: typeof fetch = fetch): GoogleListingClient {
  async function call<T>(url: string, init: RequestInit = {}, empty = false): Promise<GoogleResult<T>> {
    try {
      const res = await fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, kind: classifyGoogleFailure(res.status, body), status: res.status, detail: body.slice(0, 300) };
      }
      if (empty) return { ok: true, data: null as T };
      return { ok: true, data: (await res.json()) as T };
    } catch (error) {
      return { ok: false, kind: "error", status: 0, detail: error instanceof Error ? error.message.slice(0, 200) : "network" };
    }
  }
  return {
    listReviews: (location, pageToken) => call(`${V4}/${locationPath(location)}/reviews?pageSize=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`),
    getReview: (location, reviewId) => call(`${V4}/${locationPath(location)}/reviews/${encodeURIComponent(reviewId)}`),
    updateReply: (location, reviewId, comment) => call(`${V4}/${locationPath(location)}/reviews/${encodeURIComponent(reviewId)}/reply`, { method: "PUT", body: JSON.stringify({ comment }) }),
    deleteReply: (location, reviewId) => call(`${V4}/${locationPath(location)}/reviews/${encodeURIComponent(reviewId)}/reply`, { method: "DELETE" }, true),
    getLocation: (location, readMask) => call(`${V1}/locations/${encodeURIComponent(location.locationId)}?readMask=${readMask.map(encodeURIComponent).join(",")}`),
    patchLocation: (location, updateMask, body) => call(`${V1}/locations/${encodeURIComponent(location.locationId)}?updateMask=${updateMask.map(encodeURIComponent).join(",")}`, { method: "PATCH", body: JSON.stringify(body) }),
    createPost: (location, post) => call(`${V4}/${locationPath(location)}/localPosts`, { method: "POST", body: JSON.stringify(post) }),
    getPost: async (postName) => call(`${V4}/${safePostName(postName)}`),
    deletePost: async (postName) => call(`${V4}/${safePostName(postName)}`, { method: "DELETE" }, true),
  };
}

/** Every review, across pages. A failed page stops the read and says so. */
export async function listAllReviews(client: GoogleListingClient, location: GoogleLocationRef, maxPages = 40): Promise<GoogleResult<GoogleReview[]>> {
  const all: GoogleReview[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await client.listReviews(location, pageToken);
    if (!result.ok) return result;
    all.push(...result.data.reviews);
    pageToken = result.data.nextPageToken;
    if (!pageToken) return { ok: true, data: all };
  }
  return { ok: false, kind: "error", status: 0, detail: `More than ${maxPages} pages of reviews` };
}

export const STAR_RATING: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
