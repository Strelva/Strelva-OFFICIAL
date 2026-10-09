import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], insert: null as Record<string, unknown> | null, permission: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ verifyAuth: async () => true, requireTenantAccess: async () => null, requireTenantPermission: (...args: unknown[]) => state.permission(...args) }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "customer" }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ from: () => builder() }) }));
function builder(): unknown {
  const list = Promise.resolve({ data: state.rows, error: null });
  return new Proxy({}, { get: (_target, key) => {
    if (key === "then") return list.then.bind(list);
    if (key === "upsert") return (insert: Record<string, unknown>) => { state.insert = insert; state.rows = [{ ...insert, id: "manual-review", created_at: new Date().toISOString() }]; return builder(); };
    if (key === "maybeSingle") return async () => ({ data: state.rows[0], error: null });
    return () => builder();
  } });
}
import { POST } from "@/app/api/reviews/route";
import { getReviews } from "@/lib/reviews";
import { projectGoogleReviewExport, googleReviewContent, projectGoogleReview } from "@/platform/google-review-content";
beforeEach(() => { state.rows = []; state.insert = null; state.permission.mockResolvedValue(null); vi.stubEnv("DATA_SOURCE", "postgres"); });
it("actual authenticated Google-labelled customer import survives persistence, read and export without accepting client API identity/provenance", async () => {
  const response = await POST(new Request("http://localhost/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "google", author: "Customer supplied author", rating: 5, text: "Customer supplied review", date: "2026-10-08", externalId: "forged-api-id", providerContent: googleReviewContent(new Date("2099-01-01")) }) }));
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ source: "google", text: "Customer supplied review", author: "Customer supplied author", providerContent: { source: "customer_import", producer: "authenticated_reviews_post" } });
  expect(state.insert).toMatchObject({ external_id: null, provider_content: { source: "customer_import", producer: "authenticated_reviews_post" } });
  const [row] = await getReviews("customer");
  if (!row) throw new Error("The persisted customer import must be readable.");
  expect(row.text).toBe("Customer supplied review");
  expect(JSON.stringify(projectGoogleReviewExport(row, Date.parse("2099-01-01")))).toContain("Customer supplied review");
});
it("identified API rows cannot use a customer-import marker to bypass expiry; unknown API remains fail closed", () => {
  const imported = { source: "google", author: "Author", rating: 5, text: "API text", externalId: "api-id", providerContent: { source: "customer_import", producer: "authenticated_reviews_post" } };
  expect(projectGoogleReview(imported).text).toBe("");
  expect(projectGoogleReview({ ...imported, providerContent: undefined }).text).toBe("");
});
it("still requires tenant content-write permission", async () => {
  state.permission.mockResolvedValue(new Response("denied", { status: 403 }));
  const response = await POST(new Request("http://localhost/api/reviews", { method: "POST", body: JSON.stringify({ source: "google", author: "A", rating: 5, text: "B" }) }));
  expect(response.status).toBe(403);
  expect(state.insert).toBeNull();
});
