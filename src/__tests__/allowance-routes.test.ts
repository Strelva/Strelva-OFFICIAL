import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  release: vi.fn(),
  admin: vi.fn(),
  inspect: vi.fn(),
  award: vi.fn(),
  accept: vi.fn(),
}));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/lib/auth", () => ({ isSuperAdmin: mocks.admin }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/work-economics/allowances", async (original) => ({
  ...await original<typeof import("@/platform/work-economics/allowances")>(),
  inspectWorkAllowances: mocks.inspect,
  awardWorkAllowance: mocks.award,
  acceptWorkAllowanceCap: mocks.accept,
}));

import { GET } from "@/app/api/work-allowances/route";
import { POST as award } from "@/app/api/work-allowances/awards/route";
import { POST as accept } from "@/app/api/work-allowances/accept/route";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "Payer@Example.com", email_confirmed_at: "2026-09-15" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const allowanceId = "22222222-2222-4222-8222-222222222222";
const inspection = { allowances: [], policy: { stripeSynchronized: false } };

function post(path: string, body: unknown, origin = "https://strelva.test") {
  return new Request(`https://strelva.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("work allowance routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.admin.mockResolvedValue(true);
    mocks.session.mockResolvedValue(user);
    mocks.inspect.mockResolvedValue(inspection);
    mocks.award.mockResolvedValue(inspection);
    mocks.accept.mockResolvedValue(inspection);
  });

  it("requires the local workspace gate and a verified session", async () => {
    mocks.release.mockReturnValue(false);
    expect((await GET(new Request(`https://strelva.test/api/work-allowances?workspaceId=${workspaceId}`))).status).toBe(503);
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue({ id: user.id, email: user.email });
    expect((await GET(new Request(`https://strelva.test/api/work-allowances?workspaceId=${workspaceId}`))).status).toBe(401);
  });

  it("reads only an explicit business or allowance target", async () => {
    const response = await GET(new Request(`https://strelva.test/api/work-allowances?workspaceId=${workspaceId}`));
    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith({ userId: user.id, verifiedEmail: "payer@example.com" }, { workspaceId });
    expect(await response.json()).toMatchObject({ currentActorId: user.id, policy: { stripeSynchronized: false } });
  });

  it("keeps period and contribution awards operator-only", async () => {
    mocks.admin.mockResolvedValue(false);
    const response = await award(post("/api/work-allowances/awards", { action: "award_period" }));
    expect(response.status).toBe(403);
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("passes cap acceptance under the authenticated payer identity", async () => {
    const response = await accept(post("/api/work-allowances/accept", { action: "accept_spending_cap", allowanceId }));
    expect(response.status).toBe(200);
    expect(mocks.accept).toHaveBeenCalledWith(
      { userId: user.id, verifiedEmail: "payer@example.com" },
      { action: "accept_spending_cap", allowanceId },
    );
  });

  it("rejects cross-origin awards before applying them", async () => {
    const response = await award(post("/api/work-allowances/awards", { action: "award_period" }, "https://evil.test"));
    expect(response.status).toBe(403);
    expect(mocks.award).not.toHaveBeenCalled();
  });
});
