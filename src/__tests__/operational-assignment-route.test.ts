import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  session: vi.fn(),
  inspect: vi.fn(),
  inspectForWork: vi.fn(),
  offer: vi.fn(),
  accept: vi.fn(),
  revoke: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: boundary.session }));
vi.mock("@/products/operations/server", () => ({
  inspectOperationalAssignment: boundary.inspect,
  inspectOperationalAssignmentForWork: boundary.inspectForWork,
  offerOperationalAssignment: boundary.offer,
  acceptOperationalAssignment: boundary.accept,
  revokeOperationalAssignment: boundary.revoke,
  runOperationalAssignment: boundary.run,
}));

import { GET, POST } from "@/app/api/operational-assignments/route";

const actor = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "Operator@Example.test",
  email_confirmed_at: "2026-09-15T12:00:00.000Z",
};
const assignmentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function post(body: unknown, origin = "https://app.strelva.com") {
  return new Request("https://app.strelva.com/api/operational-assignments", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  boundary.session.mockResolvedValue(actor);
});
afterEach(() => vi.unstubAllEnvs());

describe("operational assignment route", () => {
  it("exposes only offer, accept, revoke, inspect, and run", async () => {
    boundary.offer.mockResolvedValue({ id: assignmentId, status: "offered" });
    boundary.accept.mockResolvedValue({ id: assignmentId, status: "accepted" });
    boundary.inspect.mockResolvedValue({ assignment: { id: assignmentId }, responsibility: { id: workId } });
    boundary.inspectForWork.mockResolvedValue({ id: assignmentId, workId });
    boundary.run.mockResolvedValue({ assignmentId, responsibility: { id: workId } });
    boundary.revoke.mockResolvedValue({ id: assignmentId, status: "revoked" });

    expect((await POST(post({ action: "offer", workId, assignment: {
      assigneeEmail: "operator@example.test", assigneeKind: "staff", expiresAt: "2026-09-16T12:00:00.000Z", idempotencyKey: "offer-one",
    } }))).status).toBe(201);
    expect(boundary.offer).toHaveBeenCalledWith({ userId: actor.id, verifiedEmail: "operator@example.test" }, workId, expect.anything());
    expect((await POST(post({ action: "accept", assignmentId }))).status).toBe(200);
    expect((await GET(new Request(`https://app.strelva.com/api/operational-assignments?assignmentId=${assignmentId}`))).status).toBe(200);
    expect((await GET(new Request(`https://app.strelva.com/api/operational-assignments?workId=${workId}`))).status).toBe(200);
    expect((await POST(post({ action: "run", assignmentId }))).status).toBe(200);
    expect((await POST(post({ action: "revoke", assignmentId }))).status).toBe(200);

    const forbidden = await POST(post({ action: "command", assignmentId, command: { kind: "approve" } }));
    expect(forbidden.status).toBe(400);
    expect(boundary.run).toHaveBeenCalledTimes(1);
  });

  it("fails closed before calling assignment work when signed out, cross-origin, or release-disabled", async () => {
    boundary.session.mockResolvedValue(null);
    expect((await GET(new Request(`https://app.strelva.com/api/operational-assignments?assignmentId=${assignmentId}`))).status).toBe(401);
    expect((await POST(post({ action: "run", assignmentId }, "https://foreign.example"))).status).toBe(403);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect((await POST(post({ action: "run", assignmentId }))).status).toBe(503);
    expect(boundary.run).not.toHaveBeenCalled();
  });
});
