import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), workspaces: vi.fn(), capacity: vi.fn(), getWork: vi.fn(), score: vi.fn(), rate: vi.fn(), seed: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/workspaces/repository", async (original) => ({ ...await original<typeof import("@/platform/workspaces/repository")>(),
  listWorkspaces: mocks.workspaces, assertCanSaveWork: mocks.capacity, getWork: mocks.getWork }));
vi.mock("@/products/ai-visibility/score", () => ({ scoreAiVisibility: mocks.score }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/agency-clients/seed", () => ({ seedFromSite: mocks.seed }));

import { addAgencyClient } from "@/products/agency-clients/server";

const AGENCY = "a9200000-0000-4000-8000-000000000020";
const CLIENT = "a9200000-0000-4000-8000-000000000010";
const KEY = "a9200000-0000-4000-8000-0000000000c1";
const WORK = "a9200000-0000-4000-8000-0000000000b1";
const actor = { userId: "a9200000-0000-4000-8000-000000000001", verifiedEmail: "owner@agency.example" };
const input = { action: "add" as const, agencyWorkspaceId: AGENCY, name: "Northside Bakery", url: "northside.example", idempotencyKey: KEY };
const receipt = { additionId: KEY, agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, name: "Northside Bakery",
  sourceKind: "url", sourceUrl: "https://northside.example/", prospectId: null, factsSeeded: 2, seatId: WORK,
  addedBy: actor.userId, addedAt: "2026-10-07T12:00:00Z", replayed: false };
const payload = { business: receipt.name, url: receipt.sourceUrl, score: 70, grade: "C", verdict: "Readiness measured", topFix: "Add schema",
  signals: [], measurementStatus: "partial", citation: { probed: false, mentioned: false, recommended: false, note: "Not run" } };
let operation: { status: string; work_id: string | null };

beforeEach(() => {
  vi.resetAllMocks();
  operation = { status: "running", work_id: null };
  mocks.workspaces.mockResolvedValue([{ id: AGENCY, kind: "agency", access: "member" }]);
  mocks.capacity.mockResolvedValue(undefined);
  mocks.rate.mockResolvedValue(false);
  mocks.seed.mockResolvedValue({ scan: { status: "scanned", name: receipt.name, seeded: [], message: null }, facts: {} });
  mocks.score.mockResolvedValue(payload);
  mocks.getWork.mockResolvedValue({ id: WORK, workspaceId: AGENCY, productId: "ai_visibility", resourceKind: "private_ai_visibility_work", payload });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "authorize_agency_client_add") return { data: "owner", error: null };
    if (name === "agency_add_client") return { data: { ...receipt, replayed: operation.status === "completed" }, error: null };
    if (name === "workspace_operation") {
      if (args.p_action === "checkpoint") operation = { status: "ready", work_id: null };
      if (args.p_action === "complete") operation = { status: "completed", work_id: WORK };
      return { data: [{ ...operation, id: KEY }], error: null };
    }
    throw new Error("Unexpected call");
  });
});

describe("add client using the existing private assessment operation", () => {
  it("runs one budgeted probe, saves privately, and replays without a second probe or budget", async () => {
    const first = await addAgencyClient(actor, input);
    const replay = await addAgencyClient(actor, input);
    expect(first.aiCheck).toMatchObject({ status: "ready", workId: WORK });
    expect(replay.aiCheck).toEqual(first.aiCheck);
    expect(mocks.score).toHaveBeenCalledExactlyOnceWith({ business: receipt.name, url: receipt.sourceUrl });
    expect(mocks.rate).toHaveBeenCalledExactlyOnceWith(`workspace:assessment:${actor.userId}`, 10, 86_400_000);
    const calls = mocks.rpc.mock.calls.filter(([name]) => name === "workspace_operation").map(([, args]) => args);
    expect(calls.map(args => args.p_action)).toEqual(["claim", "checkpoint", "complete", "claim"]);
    expect(calls.every(args => args.p_workspace_id === AGENCY && args.p_id === KEY)).toBe(true);
    expect(mocks.getWork).toHaveBeenCalledWith(actor, WORK);
  });

  it("recovers a checkpoint without probing again", async () => {
    operation = { status: "ready", work_id: null };
    const result = await addAgencyClient(actor, input);
    expect(result.aiCheck.status).toBe("ready");
    expect(mocks.score).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
  });

  it("retains the client and does not probe when agency membership was revoked", async () => {
    mocks.workspaces.mockResolvedValue([]);
    const result = await addAgencyClient(actor, input);
    expect(result.client.customerWorkspaceId).toBe(CLIENT);
    expect(result.aiCheck.status).toBe("unavailable");
    expect(mocks.score).not.toHaveBeenCalled();
  });
});
