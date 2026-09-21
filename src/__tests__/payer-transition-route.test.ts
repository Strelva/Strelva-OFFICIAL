import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), release: vi.fn(), read: vi.fn(), inbox: vi.fn(), command: vi.fn(), acceptJob: vi.fn() }));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/work-economics/payer-transitions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/work-economics/payer-transitions")>();
  return { ...actual, readPayerTransitions: mocks.read, readPayerTransitionInbox: mocks.inbox, commandPayerTransition: mocks.command, acceptPayerJob: mocks.acceptJob };
});

import { GET, POST } from "@/app/api/work-economics/payer-transition/route";
import { PayerTransitionAccessError, PayerTransitionConflictError } from "@/platform/work-economics/payer-transitions";

const actor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "Owner@Example.com", email_confirmed_at: "2026-09-18" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const snapshot = { transitions: [], current: null, pending: null, currentActorId: actor.id };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://strelva.test/api/work-economics/payer-transition", {
    method: "POST",
    headers: { origin: "https://strelva.test", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("payer transition route authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue(actor);
    mocks.read.mockResolvedValue(snapshot);
    mocks.inbox.mockResolvedValue(snapshot);
    mocks.command.mockResolvedValue(snapshot);
    mocks.acceptJob.mockResolvedValue({ ...snapshot, jobs: [{ id: workspaceId, workspaceId, workspaceName: "Business", productId: "operations", resourceKind: "responsibility", estimateCents: null, maxAuthorizedCents: 500, reservedCents: 0, usedCents: 0, actualCents: null, actualKnown: false, status: "accepted", createdAt: "2026-09-18" }] });
  });

  it("requires the release gate and a verified account", async () => {
    mocks.release.mockReturnValue(false);
    expect((await GET(new Request(`https://strelva.test/api/work-economics/payer-transition?workspaceId=${workspaceId}`))).status).toBe(503);
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue({ id: actor.id, email: actor.email });
    expect((await POST(post({ action: "propose", workspaceId, successorEmail: "next@example.com" }))).status).toBe(401);
  });

  it("reads history for the server-derived actor", async () => {
    const response = await GET(new Request(`https://strelva.test/api/work-economics/payer-transition?workspaceId=${workspaceId}`));
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({ userId: actor.id, verifiedEmail: "owner@example.com" }, workspaceId);
  });

  it("reads the exact actor's payer-only inbox without workspace access", async () => {
    const response = await GET(new Request("https://strelva.test/api/work-economics/payer-transition"));
    expect(response.status).toBe(200);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.inbox).toHaveBeenCalledWith({ userId: actor.id, verifiedEmail: "owner@example.com" });
  });

  it("requires exact same-origin JSON before a mutation", async () => {
    expect((await POST(post({ action: "accept", transitionId: workspaceId }, { origin: "https://evil.test", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(post({ action: "accept", transitionId: workspaceId }, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.command).not.toHaveBeenCalled();
  });

  it("passes only the verified server actor and maps authority conflicts", async () => {
    const body = { action: "accept", transitionId: workspaceId };
    expect((await POST(post(body))).status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith({ userId: actor.id, verifiedEmail: "owner@example.com" }, body);

    mocks.command.mockRejectedValueOnce(new PayerTransitionAccessError("Only the exact addressed person can accept this payer change."));
    expect((await POST(post(body))).status).toBe(403);
    mocks.command.mockRejectedValueOnce(new PayerTransitionConflictError("This payer change is no longer pending."));
    expect((await POST(post(body))).status).toBe(409);
  });

  it("accepts an exact payer job through the bounded inbox response", async () => {
    const body = { action: "accept_job", jobId: workspaceId };
    const response = await POST(post(body));
    expect(response.status).toBe(200);
    expect(mocks.acceptJob).toHaveBeenCalledWith({ userId: actor.id, verifiedEmail: "owner@example.com" }, body);
    const result = await response.json();
    expect(result.jobs).toEqual([expect.objectContaining({ id: workspaceId, maxAuthorizedCents: 500, status: "accepted" })]);
    expect(result).not.toHaveProperty("usage");
    expect(result).not.toHaveProperty("executions");
    expect(JSON.stringify(result)).not.toContain("recordedBy");

    mocks.acceptJob.mockRejectedValueOnce(new PayerTransitionAccessError("Only the exact payer can accept this job limit."));
    expect((await POST(post(body))).status).toBe(403);
  });

  it("bounds mutation bodies", async () => {
    const response = await POST(post({ action: "propose", workspaceId, successorEmail: `${"x".repeat(17_000)}@example.com` }));
    expect(response.status).toBe(413);
    expect(mocks.command).not.toHaveBeenCalled();
  });
});
