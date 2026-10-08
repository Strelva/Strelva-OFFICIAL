import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), release: vi.fn(), read: vi.fn(), record: vi.fn(), limited: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limited }));
vi.mock("@/platform/connect/attributions", async original => ({ ...await original<typeof import("@/platform/connect/attributions")>(), readBusinessAttributions: mocks.read, recordBusinessAttribution: mocks.record }));
import { GET, POST } from "@/app/api/workspace/business-attributions/route";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const business = "11111111-1111-4111-8111-111111111111";
const input = { workspaceId: business, agencyWorkspaceId: "22222222-2222-4222-8222-222222222222", source: "referral", sourceReceipt: { kind: "owner_statement", reference: "Exact owner statement" }, commandId: "33333333-3333-4333-8333-333333333333", expectedProviderId: "44444444-4444-4444-8444-444444444444" };
const url = "https://strelva.test/api/workspace/business-attributions";
const post = (body: unknown = input, headers: Record<string,string> = {}) => new Request(url, { method: "POST", headers: { origin: "https://strelva.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
describe("business attribution private API", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_PROVIDER_CHANGE", "1"); mocks.release.mockReturnValue(true); mocks.session.mockResolvedValue({ id: owner, email: "Owner@Example.test", email_confirmed_at: "2026-10-08" }); mocks.limited.mockResolvedValue(false); mocks.record.mockResolvedValue({ receipt: "fictional" }); mocks.read.mockResolvedValue({ attributions: [] }); });
  it("requires release and provider-change gates before reads and writes", async () => {
    vi.stubEnv("STRELVA_PROVIDER_CHANGE", "0"); expect((await POST(post())).status).toBe(503); expect((await GET(new Request(`${url}?workspaceId=${business}`))).status).toBe(503); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("requires a verified server identity and ignores no caller identity", async () => {
    mocks.session.mockResolvedValue({ id: owner, email: "owner@example.test" }); expect((await POST(post())).status).toBe(401); expect(mocks.record).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue({ id: owner, email: "Owner@Example.test", email_confirmed_at: "2026-10-08" }); expect((await POST(post())).status).toBe(200); expect(mocks.record).toHaveBeenCalledWith({ userId: owner, verifiedEmail: "owner@example.test" }, input);
    expect((await POST(post({ ...input, userId: owner }))).status).toBe(400);
  });
  it("enforces origin, content type, body and source receipt limits before writes", async () => {
    expect((await POST(post(input, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await POST(post(input, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(post({ ...input, sourceReceipt: { kind: "owner_statement", reference: "x".repeat(9000) } }))).status).toBe(413);
    expect((await POST(post({ ...input, source: "operator_choice" }))).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("reads only requested business with server actor and returns private no-store", async () => {
    const response = await GET(new Request(`${url}?workspaceId=${business}`)); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.read).toHaveBeenCalledWith({ userId: owner, verifiedEmail: "owner@example.test" }, business);
    expect((await GET(new Request(url))).status).toBe(400);
  });
  it("maps exact authority/conflict and throttles writes", async () => {
    mocks.record.mockRejectedValueOnce(new WorkspaceAccessError()); expect((await POST(post())).status).toBe(403);
    mocks.record.mockRejectedValueOnce(new WorkspaceConflictError("Reload evidence.")); expect((await POST(post())).status).toBe(409);
    mocks.limited.mockResolvedValueOnce(true); expect((await POST(post())).status).toBe(429);
  });
});
