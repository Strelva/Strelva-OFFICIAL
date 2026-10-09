import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rpc: vi.fn(), scan: vi.fn(), get: vi.fn(), zrange: vi.fn(), zadd: vi.fn(), zrem: vi.fn(), update: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), readdir: vi.fn(),
}));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: state.rpc }) }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({ scan: state.scan, get: state.get, zrange: state.zrange, zadd: state.zadd, zrem: state.zrem }) }));
vi.mock("@/lib/events", () => ({ updateEvent: state.update }));
vi.mock("node:fs", () => ({ promises: { readdir: state.readdir, readFile: state.readFile, writeFile: state.writeFile } }));
import { purgeGoogleReviewContent } from "@/lib/google-review-content-retention";
const event = { id: "old", source: "google", type: "review", title: "Provider author", body: "Provider comment", createdAt: "2020-01-01", metadata: { reviewId: "provider", execution: { state: "external_accepted" } } };
beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: { reviews: 1, events: 2 }, error: null });
  state.scan.mockImplementation(async (_cursor, { match }) => [0, match === "event:*" ? ["event:old"] : ["events:tenant"]]);
  state.get.mockResolvedValue(event);
  state.zrange.mockResolvedValue([JSON.stringify(event)]);
  state.update.mockImplementation(async (_id, updater) => ({ changed: true, event: updater(event) }));
  state.readdir.mockResolvedValue(["dev-reviews-tenant.json", "unrelated.json"]);
  state.readFile.mockResolvedValue(JSON.stringify([{ source: "google", author: "Provider author", text: "Provider comment", reply: "Customer reply" }, { source: "manual", text: "Customer review" }]));
});
it("physically scrubs PG, Redis bodies and legacy embedded members plus dev mirrors while preserving customer text/history", async () => {
  expect(await purgeGoogleReviewContent()).toEqual({ reviews: 1, events: 4, devFiles: 1 });
  expect(state.rpc).toHaveBeenCalledWith("purge_google_review_content");
  const callback = state.update.mock.calls[0][1];
  expect(callback(event)).toMatchObject({ body: "", metadata: { execution: { state: "external_accepted" } } });
  const member = state.zadd.mock.calls[0][1].member;
  expect(member).not.toContain("Provider comment");
  expect(state.zrem).toHaveBeenCalledWith("events:tenant", JSON.stringify(event));
  const saved = state.writeFile.mock.calls[0][1];
  expect(saved).not.toContain("Provider comment");
  expect(saved).toContain("Customer reply");
  expect(saved).toContain("Customer review");
});
it("reports database failure and locked Redis events as incomplete rather than succeeding", async () => {
  state.rpc.mockResolvedValueOnce({ data: null, error: { message: "Provider text" } });
  await expect(purgeGoogleReviewContent()).rejects.toThrow("database purge failed");
  expect(state.scan).not.toHaveBeenCalled();
  state.update.mockResolvedValueOnce({ changed: false });
  await expect(purgeGoogleReviewContent()).rejects.toThrow("retry required");
});
