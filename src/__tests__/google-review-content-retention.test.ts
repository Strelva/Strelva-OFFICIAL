import { beforeEach, describe, expect, it, vi } from "vitest";
import { googleReviewContent, googleReviewContentLive, projectGoogleReview, projectGoogleReviewEvent, projectGoogleReviewExport, GOOGLE_REVIEW_CACHE_MS } from "@/platform/google-review-content";
const now = Date.parse("2026-10-08T12:00:00Z");
const lease = googleReviewContent(new Date(now));
describe("Google API review cache", () => {
  it("expires at the original 29-day deadline and denies malformed/future/extended leases", () => {
    expect(googleReviewContentLive(lease, now)).toBe(true);
    expect(googleReviewContentLive(lease, now + GOOGLE_REVIEW_CACHE_MS)).toBe(false);
    for (const invalid of [null, {}, { ...lease, fetchedAt: "bad" }, { ...lease, expiresAt: "2099-01-01" }, { ...lease, source: "customer" }]) expect(googleReviewContentLive(invalid, now)).toBe(false);
    expect(googleReviewContentLive(lease, now - 1)).toBe(false);
  });
  it("preserves customer replies and identities while clearing expired or unknown Google content", () => {
    const review = { id: "review", source: "google", externalId: "provider-id", author: "API author", rating: 5, text: "API comment", date: "2026-01-01", reply: "Customer wrote this", providerContent: lease };
    expect(projectGoogleReview(review, now)).toBe(review);
    expect(projectGoogleReview(review, now + GOOGLE_REVIEW_CACHE_MS)).toMatchObject({ id: "review", externalId: "provider-id", text: "", author: "", rating: null, date: "", reply: "Customer wrote this" });
    expect(projectGoogleReview({ ...review, providerContent: undefined }, now).text).toBe("");
    expect(projectGoogleReview({ ...review, source: "manual" }, now + GOOGLE_REVIEW_CACHE_MS).text).toBe("API comment");
  });
  it("removes raw event copies and nested review context without dropping authored reply or effect history", () => {
    const event = { source: "google", type: "review", title: "API author review", body: "API comment", metadata: { reviewId: "provider-id", author: "API author", rating: 5, review: { text: "API comment" }, execution: { state: "external_accepted" } } };
    expect(projectGoogleReviewEvent(event, now)).toMatchObject({ title: "Google review (cached content expired)", body: "", metadata: { reviewId: "provider-id", execution: { state: "external_accepted" } } });
    const draft = { ...event, source: "ai", body: "Customer reply draft", metadata: { ...event.metadata, kind: "review_reply_draft", draftedReply: "Customer reply draft", providerContent: lease } };
    const expired = projectGoogleReviewEvent(draft, now + GOOGLE_REVIEW_CACHE_MS);
    expect(expired.body).toBe("Customer reply draft");
    expect(expired.metadata).not.toHaveProperty("review");
    expect(expired.metadata).not.toHaveProperty("author");
    expect(expired.metadata.draftedReply).toBe("Customer reply draft");
  });
  it("projects nested schema-2 history and native review export rows", () => {
    const result = projectGoogleReviewExport({ reviews: [{ source: "google", text: "API comment", author: "API author", rating: 5, provider_content: lease }], history: [{ source: "google", type: "review", body: "API comment", metadata: { review: { text: "API comment" } } }], manual: { source: "manual", text: "Customer text" } }, now + GOOGLE_REVIEW_CACHE_MS);
    expect(JSON.stringify(result)).not.toContain("API comment");
    expect(JSON.stringify(result)).not.toContain("API author");
    expect(JSON.stringify(result)).toContain("Customer text");
  });
});
const mocks = vi.hoisted(() => ({ purge: vi.fn(), heartbeat: vi.fn() }));
vi.mock("@/lib/google-review-content-retention", () => ({ purgeGoogleReviewContent: mocks.purge }));
vi.mock("@/platform/infra/heartbeat", async original => ({ ...(await original() as object), recordHeartbeat: mocks.heartbeat }));
import { GET } from "@/app/api/cron/google-review-content-retention/route";
import { CRON_MAX_AGE_SECONDS } from "@/platform/infra/heartbeat";
import schedule from "../../vercel.json";
describe("review retention scheduled endpoint", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "local-proof"); vi.stubEnv("STRELVA_GOOGLE_LISTING_RELEASE", "0"); });
  it("registers the actual hourly endpoint and heartbeat deadline", () => {
    expect(schedule.crons).toContainEqual({ path: "/api/cron/google-review-content-retention", schedule: "0 * * * *" });
    expect(CRON_MAX_AGE_SECONDS["google-review-content-retention"]).toBe(3 * 3600);
  });
  it("purges while Google listing release is off", async () => {
    mocks.purge.mockResolvedValue({ reviews: 2, events: 3, devFiles: 1 });
    expect((await GET(new Request("http://localhost", { headers: { authorization: "Bearer local-proof" } }))).status).toBe(200);
    expect(mocks.purge).toHaveBeenCalledOnce();
    expect(mocks.heartbeat).toHaveBeenCalledWith("google-review-content-retention", { ok: true, processed: 6 });
  });
  it("rejects unauthenticated calls and marks storage failures for retry without exposing provider content", async () => {
    expect((await GET(new Request("http://localhost"))).status).toBe(401);
    expect(mocks.purge).not.toHaveBeenCalled();
    mocks.purge.mockRejectedValue(new Error("API comment and credentials"));
    const response = await GET(new Request("http://localhost", { headers: { authorization: "Bearer local-proof" } }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("credentials");
    expect(mocks.heartbeat).toHaveBeenCalledWith("google-review-content-retention", { ok: false, processed: 0, failed: 1 });
  });
});
