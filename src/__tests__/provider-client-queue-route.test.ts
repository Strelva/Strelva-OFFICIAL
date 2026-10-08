import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), rate: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
import { GET } from "@/app/api/workspace/provider-client-queue/route";
const AGENCY = "25700000-0000-4000-8000-000000000020";
const USER = "25700000-0000-4000-8000-000000000002";
const call = (query = `workspaceId=${AGENCY}`) => GET(new Request(`https://app.strelva.com/api/workspace/provider-client-queue?${query}`));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mocks.session.mockResolvedValue({ id: USER, email: "Staff@queue.example.test", email_confirmed_at: "2026-10-08" });
  mocks.rate.mockResolvedValue(false); mocks.rpc.mockResolvedValue({ data: { agencyWorkspaceId: AGENCY, items: [], nextCursor: null }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("provider client queue route", () => {
  it("uses the confirmed session identity, bounded RPC and private no-store response", async () => {
    const response = await call(); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("read_provider_client_queue", { p_user_id: USER, p_verified_email: "staff@queue.example.test", p_agency_workspace_id: AGENCY, p_after_at: null, p_after_key: null, p_limit: 50 });
  });
  it("fails closed for flag off, unsigned and unconfirmed users", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", ""); expect((await call()).status).toBe(503);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); mocks.session.mockResolvedValue(null); expect((await call()).status).toBe(401);
    mocks.session.mockResolvedValue({ id: USER, email: "staff@queue.example.test", email_confirmed_at: null }); expect((await call()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns permission denied for revoked agency access without leaking SQL details", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "provider_queue_access_denied private-contact" } });
    const response = await call(); expect(response.status).toBe(403); expect(await response.text()).not.toContain("private-contact");
  });
  it("handles store and malformed-output failures as incomplete reads", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } }); expect((await call()).status).toBe(503);
    mocks.rpc.mockResolvedValue({ data: { agencyWorkspaceId: AGENCY, items: [], nextCursor: null, token: "secret" }, error: null }); expect((await call()).status).toBe(503);
  });
  it("validates cursor and passes it without changing identity", async () => {
    const cursor = { at: "2026-10-08T12:00:00Z", key: "listing:25700000-0000-4000-8000-000000000001" };
    expect((await call(`workspaceId=${AGENCY}&cursor=${encodeURIComponent(JSON.stringify(cursor))}`)).status).toBe(200);
    expect(mocks.rpc.mock.calls[0]![1]).toMatchObject({ p_after_at: cursor.at, p_after_key: cursor.key });
    mocks.rpc.mockClear(); expect((await call(`workspaceId=${AGENCY}&cursor=invalid`)).status).toBe(400);
    expect((await call(`workspaceId=bad`)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rate limits before reading clients", async () => { mocks.rate.mockResolvedValue(true); expect((await call()).status).toBe(429); expect(mocks.rpc).not.toHaveBeenCalled(); });
});
