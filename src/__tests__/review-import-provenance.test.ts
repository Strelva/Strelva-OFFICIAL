import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ enabled: true, zrange: vi.fn(), mget: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => state.enabled ? state : null }));
import { reconcileLegacyReviewImports } from "@/lib/review-import-provenance";
import type { ReviewItem } from "@/lib/types";
const manual: ReviewItem = { id: "manual", source: "google", author: "Imported author", text: "Accepted imported text", rating: 5, date: "2026-10-08" };
beforeEach(() => { state.enabled = true; state.zrange.mockResolvedValue([]); state.mget.mockResolvedValue([]); });
it("recognizes only the supported complete no-provider-ID legacy import shape", async () => {
  const [imported, identified, incomplete] = await reconcileLegacyReviewImports("customer", [manual, { ...manual, externalId: "provider" }, { ...manual, text: "" }]);
  expect(imported.providerContent).toMatchObject({ source: "customer_import", producer: "legacy_reviews_post_no_external_id" });
  expect(identified.providerContent).toBeUndefined();
  expect(incomplete.providerContent).toBeUndefined();
});
it("matching API mirror evidence or unavailable history never establishes customer provenance", async () => {
  state.zrange.mockResolvedValue(["api-event"]);
  state.mget.mockResolvedValue([{ id: "api-event", tenantId: "customer", source: "google", type: "review", body: manual.text, metadata: { author: manual.author, reviewId: "actual-api-id" } }]);
  expect((await reconcileLegacyReviewImports("customer", [manual]))[0].providerContent).toBeUndefined();
  state.enabled = false;
  expect((await reconcileLegacyReviewImports("customer", [manual]))[0].providerContent).toBeUndefined();
});
