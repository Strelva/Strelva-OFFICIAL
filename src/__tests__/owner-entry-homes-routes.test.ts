import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const actor = vi.hoisted(() => vi.fn());
const homesOpen = vi.hoisted(() => vi.fn());
const linkedSite = vi.hoisted(() => vi.fn());
const tenantAccess = vi.hoisted(() => vi.fn());
const submit = vi.hoisted(() => vi.fn());
const limited = vi.hoisted(() => vi.fn());
const summaries = vi.hoisted(() => vi.fn());

vi.mock("@/platform/workspaces/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/workspaces/http")>()),
  workspaceHttpActor: actor,
}));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ ownerEntryHomesOpen: homesOpen, readLinkedSite: linkedSite }));
vi.mock("@/platform/infra/auth", () => ({ requireTenantAccess: tenantAccess }));
vi.mock("@/lib/reviews/owner-reply", () => ({ submitOwnerReviewReply: submit }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: limited }));
vi.mock("@/platform/owner-entry/site-summary", () => ({ readSiteSummaries: summaries }));

import { POST as reply } from "@/app/api/workspace/reviews/reply/route";
import { GET as siteSummary } from "@/app/api/workspace/site-summary/route";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const WS = "7f000000-0000-4000-8000-000000000010";
const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const SITE = { tenantId: "lakeshore", tenantStableId: "7f000000-0000-4000-8000-0000000000b2", siteName: "Lakeshore" };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.strelva.test/api/workspace/reviews/reply", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.strelva.test", ...headers },
    body: JSON.stringify(body),
  });
}
const valid = { workspaceId: WS, tenantId: "lakeshore", reviewId: "r1", reply: "Thanks, Jane!" };

beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  for (const mock of [actor, homesOpen, linkedSite, tenantAccess, submit, limited, summaries]) mock.mockReset();
  actor.mockResolvedValue(ACTOR);
  homesOpen.mockResolvedValue(true);
  linkedSite.mockResolvedValue(SITE);
  tenantAccess.mockResolvedValue(null);
  limited.mockResolvedValue(false);
  submit.mockResolvedValue({ status: "replied", review: { id: "r1", reply: "Thanks, Jane!" }, published: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/workspace/reviews/reply", () => {
  it("replies through the shared governed path for a member with tenant access", async () => {
    const response = await reply(post(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ published: true, review: { reply: "Thanks, Jane!" } });
    expect(linkedSite).toHaveBeenCalledWith(ACTOR, WS, "lakeshore");
    expect(tenantAccess).toHaveBeenCalledWith("lakeshore");
    expect(submit).toHaveBeenCalledWith("lakeshore", "r1", "Thanks, Jane!", ACTOR.userId);
  });

  it("refuses while workspaces are off, from another origin, or signed out", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect((await reply(post(valid))).status).toBe(503);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    expect((await reply(post(valid, { origin: "https://evil.test" }))).status).toBe(403);
    actor.mockResolvedValueOnce(null);
    expect((await reply(post(valid))).status).toBe(401);
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses while owner entry is off for this business", async () => {
    homesOpen.mockResolvedValueOnce(false);
    expect((await reply(post(valid))).status).toBe(503);
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses a site that isn't this business's, a non-member, and a person without tenant access", async () => {
    linkedSite.mockResolvedValueOnce(null);
    expect((await reply(post(valid))).status).toBe(403);
    linkedSite.mockRejectedValueOnce(new WorkspaceAccessError());
    expect((await reply(post(valid))).status).toBe(403);
    tenantAccess.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    expect((await reply(post(valid))).status).toBe(403);
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized reply and extra fields", async () => {
    expect((await reply(post({ ...valid, reply: "   " }))).status).toBe(400);
    expect((await reply(post({ ...valid, reply: "x".repeat(4001) }))).status).toBe(400);
    expect((await reply(post({ ...valid, extra: 1 }))).status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    limited.mockResolvedValueOnce(true);
    expect((await reply(post(valid))).status).toBe(429);
  });

  it("says when Google didn't take it or the review is gone, and saves nothing", async () => {
    submit.mockResolvedValueOnce({ status: "publish_failed" });
    const failed = await reply(post(valid));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ published: false });
    submit.mockResolvedValueOnce({ status: "not_found" });
    expect((await reply(post(valid))).status).toBe(404);
  });
});

describe("GET /api/workspace/site-summary", () => {
  const get = (workspaceId = WS) => siteSummary(new Request(`https://app.strelva.test/api/workspace/site-summary?workspaceId=${workspaceId}`));

  it("returns each linked site's summary for a member", async () => {
    summaries.mockResolvedValueOnce({ sites: [], deniedSites: [] });
    const response = await get();
    expect(response.status).toBe(200);
    expect(summaries).toHaveBeenCalledWith(ACTOR, WS);
  });

  it("is closed (503) while owner entry is off, so Home shows nothing new", async () => {
    homesOpen.mockResolvedValueOnce(false);
    expect((await get()).status).toBe(503);
    expect(summaries).not.toHaveBeenCalled();
  });

  it("refuses signed-out people, non-members and a bad id", async () => {
    actor.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    summaries.mockRejectedValueOnce(new WorkspaceAccessError());
    expect((await get()).status).toBe(403);
    expect((await get("nope")).status).toBe(400);
  });
});
