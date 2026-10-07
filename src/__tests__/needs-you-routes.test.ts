import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  heartbeat: vi.fn(),
  released: vi.fn(() => true),
  workspaceReleased: vi.fn(() => true),
  chase: vi.fn(),
  list: vi.fn(),
  decide: vi.fn(),
  handled: vi.fn(),
  actor: vi.fn(),
  workspaces: vi.fn(),
  undo: vi.fn(),
  superAdmin: vi.fn(async () => false),
}));

vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.auth }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: vi.fn(async () => false) }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.workspaceReleased }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.workspaces }));
vi.mock("@/platform/infra/db/repositories", () => ({ isSuperAdminUser: mocks.superAdmin }));
vi.mock("@/platform/needs-you/server", () => ({
  needsYouReleaseEnabled: mocks.released,
  needsYouService: () => ({ chase: mocks.chase, list: mocks.list, decide: mocks.decide }),
  readStrelvaHandled: mocks.handled,
}));
vi.mock("@/platform/business-record", () => ({
  undoBusinessRecordRevision: mocks.undo,
  BusinessRecordConflictError: class extends Error { code = "business_record_undo_conflict"; },
}));
vi.mock("@/platform/workspaces/http", async () => {
  const actual = await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http");
  return { ...actual, workspaceHttpActor: mocks.actor };
});

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const ACTOR = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const ITEM = "aaaaaaaa-0000-4000-8000-0000000000b1";

function jsonPost(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: new URL(url).origin } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.released.mockReturnValue(true);
  mocks.workspaceReleased.mockReturnValue(true);
  mocks.auth.mockReturnValue(null);
  mocks.actor.mockResolvedValue(ACTOR);
  mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "owner", name: "Mooney" }]);
  mocks.list.mockResolvedValue({ items: [], complete: true });
  mocks.handled.mockResolvedValue([]);
  mocks.superAdmin.mockResolvedValue(false);
});

describe("needs-you cron", () => {
  it("is declared in vercel.json and registered for the heartbeat watchdog", async () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toContainEqual({ path: "/api/cron/needs-you", schedule: "0 * * * *" });
    const { CRON_MAX_AGE_SECONDS } = await vi.importActual<typeof import("@/platform/infra/heartbeat")>("@/platform/infra/heartbeat");
    expect(CRON_MAX_AGE_SECONDS["needs-you"]).toBeGreaterThan(3600);
  });

  it("keeps cron auth in front of everything", async () => {
    const denied = new Response("no", { status: 401 });
    mocks.auth.mockReturnValue(denied);
    const { GET } = await import("@/app/api/cron/needs-you/route");
    expect(await GET(new Request("https://app.example.test/api/cron/needs-you"))).toBe(denied);
    expect(mocks.chase).not.toHaveBeenCalled();
  });

  it("does nothing but a heartbeat while the release is off", async () => {
    mocks.released.mockReturnValue(false);
    const { GET } = await import("@/app/api/cron/needs-you/route");
    const body = await (await GET(new Request("https://app.example.test/api/cron/needs-you"))).json();
    expect(body.status).toBe("disabled");
    expect(mocks.chase).not.toHaveBeenCalled();
    expect(mocks.heartbeat).toHaveBeenCalledWith("needs-you", { ok: true, processed: 0 });
  });

  it("runs the chase and reports owner-not-told counts", async () => {
    mocks.chase.mockResolvedValue({ lapsed: 1, reminded: 0, digests: 1, urgent: 1, ownerNotTold: 3, failed: 0 });
    const { GET } = await import("@/app/api/cron/needs-you/route");
    const body = await (await GET(new Request("https://app.example.test/api/cron/needs-you"))).json();
    expect(body).toMatchObject({ ownerNotTold: 3, lapsed: 1 });
    expect(mocks.heartbeat).toHaveBeenCalledWith("needs-you", { ok: true, processed: 3, failed: 0 });
  });

  it("records a failed heartbeat when the chase throws", async () => {
    mocks.chase.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/cron/needs-you/route");
    expect((await GET(new Request("https://app.example.test/api/cron/needs-you"))).status).toBe(500);
    expect(mocks.heartbeat).toHaveBeenCalledWith("needs-you", { ok: false, failed: 1 });
  });
});

describe("/api/workspace/needs-you", () => {
  it("answers 503 while the release is off", async () => {
    mocks.released.mockReturnValue(false);
    const { GET, POST } = await import("@/app/api/workspace/needs-you/route");
    expect((await GET(new Request(`https://app.example.test/api/workspace/needs-you?workspaceId=${WS}`))).status).toBe(503);
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you", {}))).status).toBe(503);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("needs a signed-in member of the business", async () => {
    const { GET } = await import("@/app/api/workspace/needs-you/route");
    mocks.actor.mockResolvedValueOnce(null);
    expect((await GET(new Request(`https://app.example.test/api/workspace/needs-you?workspaceId=${WS}`))).status).toBe(401);
    mocks.workspaces.mockResolvedValueOnce([{ id: WS, kind: "customer", access: "delegated_read", name: "Mooney" }]);
    expect((await GET(new Request(`https://app.example.test/api/workspace/needs-you?workspaceId=${WS}`))).status).toBe(403);
    mocks.workspaces.mockResolvedValueOnce([]);
    expect((await GET(new Request(`https://app.example.test/api/workspace/needs-you?workspaceId=${WS}`))).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("lists items and handled receipts, and keeps Needs you when handled can't load", async () => {
    mocks.list.mockResolvedValue({ items: [{ id: ITEM }], complete: false });
    mocks.handled.mockRejectedValue(new Error("down"));
    const { GET } = await import("@/app/api/workspace/needs-you/route");
    const body = await (await GET(new Request(`https://app.example.test/api/workspace/needs-you?workspaceId=${WS}`))).json();
    expect(body).toMatchObject({ role: "owner", items: [{ id: ITEM }], complete: false, handled: [], handledAvailable: false });
  });

  it("decides in session through the service and maps refusals", async () => {
    const { POST } = await import("@/app/api/workspace/needs-you/route");
    const body = { workspaceId: WS, itemId: ITEM, revision: "a".repeat(64), decision: "approve" };
    mocks.decide.mockResolvedValueOnce({ status: "done", item: { id: ITEM } });
    const ok = await POST(jsonPost("https://app.example.test/api/workspace/needs-you", body));
    expect(ok.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith({ ...body, by: { kind: "session", actor: ACTOR } });
    mocks.decide.mockResolvedValueOnce({ status: "forbidden", item: null });
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you", body))).status).toBe(403);
    mocks.decide.mockResolvedValueOnce({ status: "changed", item: null });
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you", body))).status).toBe(409);
  });

  it("refuses a Strelva operator holding an admin seat: the owner decides (#530)", async () => {
    const { POST } = await import("@/app/api/workspace/needs-you/route");
    const body = { workspaceId: WS, itemId: ITEM, revision: "a".repeat(64), decision: "approve" };
    mocks.superAdmin.mockResolvedValue(true);
    mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "admin", name: "Mooney" }]);
    const refused = await POST(jsonPost("https://app.example.test/api/workspace/needs-you", body));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ status: "forbidden" });
    expect(mocks.superAdmin).toHaveBeenCalledWith(ACTOR.userId);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("lets a super admin who owns the business decide, and an ordinary admin reach the SQL check", async () => {
    const { POST } = await import("@/app/api/workspace/needs-you/route");
    const body = { workspaceId: WS, itemId: ITEM, revision: "a".repeat(64), decision: "approve" };
    mocks.decide.mockResolvedValue({ status: "done", item: { id: ITEM } });
    mocks.superAdmin.mockResolvedValue(true);
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you", body))).status).toBe(200);
    mocks.superAdmin.mockResolvedValue(false);
    mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "admin", name: "Mooney" }]);
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you", body))).status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledTimes(2);
  });

  it("refuses a cross-site post and a malformed body", async () => {
    const { POST } = await import("@/app/api/workspace/needs-you/route");
    const crossSite = new Request("https://app.example.test/api/workspace/needs-you", { method: "POST", body: "{}", headers: { "content-type": "application/json", origin: "https://evil.example" } });
    expect((await POST(crossSite)).status).toBe(403);
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you", { workspaceId: WS, itemId: ITEM, revision: "x", decision: "approve" }))).status).toBe(400);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});

describe("/api/workspace/needs-you/undo", () => {
  it("undoes a business record revision as the owner", async () => {
    mocks.undo.mockResolvedValue({ revision: 5 });
    const { POST } = await import("@/app/api/workspace/needs-you/undo/route");
    const res = await POST(jsonPost("https://app.example.test/api/workspace/needs-you/undo", { workspaceId: WS, receiptId: "record:12" }));
    expect(res.status).toBe(200);
    expect(mocks.undo).toHaveBeenCalledWith(ACTOR, WS, 12, { source: "owner" });
  });

  it("refuses members, other receipts and the release being off", async () => {
    const { POST } = await import("@/app/api/workspace/needs-you/undo/route");
    mocks.workspaces.mockResolvedValueOnce([{ id: WS, kind: "customer", access: "member", role: "member", name: "Mooney" }]);
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you/undo", { workspaceId: WS, receiptId: "record:12" }))).status).toBe(403);
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you/undo", { workspaceId: WS, receiptId: "tenant_event:abc" }))).status).toBe(400);
    mocks.released.mockReturnValue(false);
    expect((await POST(jsonPost("https://app.example.test/api/workspace/needs-you/undo", { workspaceId: WS, receiptId: "record:12" }))).status).toBe(503);
    expect(mocks.undo).not.toHaveBeenCalled();
  });
});
