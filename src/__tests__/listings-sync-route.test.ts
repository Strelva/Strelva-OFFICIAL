import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), mayBeOn: vi.fn(), available: vi.fn(), view: vi.fn(), check: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/products/listings-sync/server", () => ({
  listingsSyncMayBeOn: mocks.mayBeOn, listingsSyncAvailable: mocks.available, readListingsSyncView: mocks.view, checkListingsNow: mocks.check,
}));

import { GET, POST } from "@/app/api/workspace/listings-sync/route";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { listingsSyncViewSchema } from "@/products/listings-sync/contracts";
import { checkListingsNow, readListingsSyncView } from "@/products/listings-sync/view";

const WS = "7f000000-0000-4000-8000-000000000010";
const ORIGIN = "https://app.strelva.com";
const view = { workspaceId: WS, access: "owner", checkedAt: null, checking: false, recordRevision: null, surfaces: [], fixes: [], release: null, pendingConfirmation: 0, waitingOnOwner: false, lastError: null };
const get = (query = `?workspaceId=${WS}`) => new Request(`${ORIGIN}/api/workspace/listings-sync${query}`);
const post = (body: unknown) => new Request(`${ORIGIN}/api/workspace/listings-sync`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mocks.session.mockResolvedValue({ id: "7f000000-0000-4000-8000-0000000000a1", email: "owner@example.test", email_confirmed_at: "2026-10-01" });
  mocks.mayBeOn.mockReturnValue(true);
  mocks.available.mockResolvedValue(true);
  mocks.view.mockResolvedValue(view);
  mocks.check.mockResolvedValue(view);
});

describe("GET /api/workspace/listings-sync", () => {
  it("is 404 and never calls the product while the flag is off", async () => {
    mocks.mayBeOn.mockReturnValue(false);
    const response = await GET(get());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Listings in sync is not on for this business." });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.view).not.toHaveBeenCalled();
  });
  it("is 401 without a signed-in person", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
  });
  it("is 404 when the App is not on for this business", async () => {
    mocks.available.mockResolvedValue(false);
    expect((await GET(get())).status).toBe(404);
    expect(mocks.view).not.toHaveBeenCalled();
  });
  it("returns a view the schema accepts", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(listingsSyncViewSchema.safeParse(await response.json()).success).toBe(true);
    expect(mocks.available).toHaveBeenCalledWith(WS, { operator: false, tester: false, userId: "7f000000-0000-4000-8000-0000000000a1" });
  });
  it("is 400 without a workspace id", async () => {
    expect((await GET(get(""))).status).toBe(400);
  });
});

describe("POST /api/workspace/listings-sync", () => {
  it("runs a check", async () => {
    const response = await POST(post({ action: "check", workspaceId: WS }));
    expect(response.status).toBe(200);
    expect(mocks.check).toHaveBeenCalledWith(expect.objectContaining({ userId: "7f000000-0000-4000-8000-0000000000a1" }), WS);
  });
  it("answers 409 when checked too often", async () => {
    mocks.check.mockRejectedValue(new WorkspaceConflictError("Checked several times this hour. Try again later."));
    const response = await POST(post({ action: "check", workspaceId: WS }));
    expect(response.status).toBe(409);
  });
  it("rejects extra keys, so there is no approve through this route", async () => {
    expect((await POST(post({ action: "check", workspaceId: WS, approve: true }))).status).toBe(400);
    expect((await POST(post({ action: "approve", workspaceId: WS }))).status).toBe(400);
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("is 404 while off and 403 for a cross-site request", async () => {
    mocks.mayBeOn.mockReturnValue(false);
    expect((await POST(post({ action: "check", workspaceId: WS }))).status).toBe(404);
    mocks.mayBeOn.mockReturnValue(true);
    const cross = new Request(`${ORIGIN}/api/workspace/listings-sync`, { method: "POST", body: "{}", headers: { "content-type": "application/json", origin: "https://evil.example" } });
    expect((await POST(cross)).status).toBe(403);
  });
});

describe("view helpers", () => {
  const actor = { userId: "u1", verifiedEmail: "o@example.test" };
  const read = (over: Record<string, unknown> = {}) => ({
    access: "owner", latest: null, lastDone: null, fixes: [], release: null, releaseCount: 0, ...over,
  });
  it("is checking while a check is queued or running", async () => {
    for (const status of ["queued", "running"]) {
      const v = await readListingsSyncView(actor, WS, {
        store: { read: async () => read({ latest: { id: WS, status, recordRevision: 1, trigger: "sweep", error: null, createdAt: "x", finishedAt: null } }) as never },
        reviews: () => ({ read: async () => null }),
      });
      expect(v.checking).toBe(true);
    }
  });
  it("counts only pending listings facts and flags a waiting owner decision", async () => {
    const fix = { id: "7f000000-0000-4000-8000-0000000000f1", surfaceKey: "booking:x", factKey: "hours", kind: "booking_hours", proposed: {}, status: "proposed", outcomeRef: null, reason: null, recordRevision: 1 };
    const v = await readListingsSyncView(actor, WS, {
      store: { read: async () => read({ fixes: [fix], lastDone: { id: WS, recordRevision: 1, readings: [], differs: 1, compared: 1, finishedAt: "2026-10-15T00:00:00Z" } }) as never },
      reviews: () => ({ read: async () => ({ changes: [{ entity: "fact", id: "phone" }, { entity: "fact", id: "email" }, { entity: "service", id: "phone" }] }) }),
    });
    expect(v.pendingConfirmation).toBe(1);
    expect(v.waitingOnOwner).toBe(true);
    expect(v.checkedAt).toBe("2026-10-15T00:00:00Z");
  });
  it("says the last check did not finish when it failed", async () => {
    const v = await readListingsSyncView(actor, WS, {
      store: { read: async () => read({ latest: { id: WS, status: "failed", recordRevision: 1, trigger: "sweep", error: "x", createdAt: "x", finishedAt: "x" } }) as never },
      reviews: () => ({ read: async () => null }),
    });
    expect(v.lastError).toBe("The last check didn't finish. Check again.");
  });
  it("limits Check now to 6 an hour and otherwise queues and runs one check", async () => {
    const deps = { limited: vi.fn(async () => false), queue: vi.fn(async () => "c1"), run: vi.fn(async () => ({ ran: 1, failed: 0 })), view: vi.fn(async () => view as never), record: vi.fn(async () => ({}) as never) };
    await checkListingsNow(actor, WS, deps as never);
    expect(deps.limited).toHaveBeenCalledWith(`listings-sync:check:${WS}`, 6, 3_600_000);
    expect(deps.queue).toHaveBeenCalledWith(WS, "check_now", "u1");
    expect(deps.run).toHaveBeenCalledWith({ checkId: "c1", limit: 1, budgetMs: 50_000 });
    deps.limited.mockResolvedValueOnce(true as never);
    await expect(checkListingsNow(actor, WS, deps as never)).rejects.toThrow("Checked several times this hour. Try again later.");
  });
  it("does nothing for a stranger", async () => {
    const deps = { limited: vi.fn(), queue: vi.fn(), run: vi.fn(), view: vi.fn(), record: vi.fn(async () => { throw new Error("denied"); }) };
    await expect(checkListingsNow(actor, WS, deps as never)).rejects.toThrow("denied");
    expect(deps.queue).not.toHaveBeenCalled();
  });
});
