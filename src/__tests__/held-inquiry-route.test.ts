import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actor = vi.hoisted(() => vi.fn());
const homesOpen = vi.hoisted(() => vi.fn());
const limited = vi.hoisted(() => vi.fn());
const decide = vi.hoisted(() => vi.fn());

vi.mock("@/platform/workspaces/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/workspaces/http")>()),
  workspaceHttpActor: actor,
}));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ ownerEntryHomesOpen: homesOpen }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: limited }));
vi.mock("@/products/inquiries/workspace-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/products/inquiries/workspace-records")>()),
  decideHeldInquiry: decide,
}));

import { POST } from "@/app/api/workspace/inquiries/held/route";
import { InquiryRecordsError } from "@/lib/inquiry-records";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const WS = "7f000000-0000-4000-8000-000000000010";
const ROW = "7f000000-0000-4000-8000-0000000000d1";
const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const post = (body: unknown, headers: Record<string, string> = {}) => new Request("https://app.strelva.test/api/workspace/inquiries/held", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://app.strelva.test", ...headers },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
  for (const mock of [actor, homesOpen, limited, decide]) mock.mockReset();
  actor.mockResolvedValue(ACTOR);
  homesOpen.mockResolvedValue(true);
  limited.mockResolvedValue(false);
  decide.mockResolvedValue({ status: "decided", lead: { intakeState: "released" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/workspace/inquiries/held", () => {
  it("releases a held message for the owner", async () => {
    const response = await POST(post({ workspaceId: WS, rowId: ROW, decision: "release" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "decided", state: "released" });
    expect(decide).toHaveBeenCalledWith(ACTOR, WS, ROW, "release");
  });

  it("is closed while the switch is off and refuses cross-site or signed-out requests", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "");
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "release" }))).status).toBe(503);
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "release" }, { origin: "https://evil.test" }))).status).toBe(403);
    actor.mockResolvedValue(null);
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "release" }))).status).toBe(401);
    expect(decide).not.toHaveBeenCalled();
  });

  it("refuses members and admins (the database decides) and maps every failure", async () => {
    decide.mockRejectedValueOnce(new WorkspaceAccessError());
    const denied = await POST(post({ workspaceId: WS, rowId: ROW, decision: "release" }));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "Only the business owner can decide on held messages." });
    decide.mockRejectedValueOnce(new InquiryRecordsError("not_found"));
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "hold" }))).status).toBe(404);
    decide.mockRejectedValueOnce(new InquiryRecordsError("not_held"));
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "confirm_spam" }))).status).toBe(409);
    decide.mockRejectedValueOnce(new InquiryRecordsError("timeout"));
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "release" }))).status).toBe(503);
  });

  it("validates input, the workspace homes switch and the rate limit", async () => {
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "delete" }))).status).toBe(400);
    expect((await POST(post({ workspaceId: "nope", rowId: ROW, decision: "release" }))).status).toBe(400);
    homesOpen.mockResolvedValueOnce(false);
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "release" }))).status).toBe(503);
    limited.mockResolvedValueOnce(true);
    expect((await POST(post({ workspaceId: WS, rowId: ROW, decision: "release" }))).status).toBe(429);
    expect(decide).not.toHaveBeenCalled();
  });
});
