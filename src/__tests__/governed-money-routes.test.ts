import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), operator: vi.fn(), release: vi.fn(), limited: vi.fn(), read: vi.fn(), prepare: vi.fn(), record: vi.fn(), listing: vi.fn(), execute: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/infra/auth", () => ({ getAuthenticatedOperatorContext: mocks.operator }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limited }));
vi.mock("@/platform/connect/governed-operations", async original => ({ ...await original<typeof import("@/platform/connect/governed-operations")>(), readGovernedMoney: mocks.read, prepareGovernedCollection: mocks.prepare, recordOperatorMoneyConfiguration: mocks.record, registerGovernedCreatorListing: mocks.listing, executeGovernedPayout: mocks.execute }));
import { GET, POST } from "@/app/api/workspace/money-preparation/route";
import { POST as payoutPOST } from "@/app/api/admin/money-payouts/route";
import { POST as operatorPOST } from "@/app/api/admin/money-configuration/route";
const workspaceId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333";
const url = "https://strelva.test/api/workspace/money-preparation";
const input = { action: "accept_collection_terms", workspaceId, lineId: other, priceVersion: "shown-price", amountCents: 1700, currency: "cad", installationId: null, periodStart: "2099-01-01T10:00:00Z", periodEnd: "2099-02-01T10:00:00Z" };
const post = (body: unknown = input, headers: Record<string, string> = {}) => new Request(url, { method: "POST", headers: { origin: "https://strelva.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
describe("ordinary money preparation HTTP", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_REVENUE_SPLITS", "1"); mocks.release.mockReturnValue(true); mocks.session.mockResolvedValue({ id: userId, email: "Owner@Example.test", email_confirmed_at: "2026-10-09" }); mocks.operator.mockResolvedValue({ actor: { userId, verifiedEmail: "operator@example.test" } }); mocks.limited.mockResolvedValue(false); mocks.read.mockResolvedValue({ workspaceId, prices: [] }); mocks.prepare.mockResolvedValue({ collectionDispatch: "not_configured" }); mocks.record.mockResolvedValue({ replayed: false }); mocks.execute.mockResolvedValue({ transferId: "tr_Accepted" }); });
  it("requires release before calls and actual verified owner identity", async () => {
    vi.stubEnv("STRELVA_REVENUE_SPLITS", "0"); expect((await POST(post())).status).toBe(503); expect(mocks.session).not.toHaveBeenCalled(); vi.stubEnv("STRELVA_REVENUE_SPLITS", "1");
    expect((await POST(post())).status).toBe(200); const { action: _action, ...command } = input; expect(mocks.prepare).toHaveBeenCalledWith({ userId, verifiedEmail: "owner@example.test" }, command);
    mocks.session.mockResolvedValue({ id: userId, email: "owner@example.test" }); expect((await POST(post())).status).toBe(401);
  });
  it("refuses forged identity/payer, cross-origin, wrong content type, oversized body and invalid period", async () => {
    for (const body of [{ ...input, userId: other }, { ...input, customerId: "cus_Forged" }, { ...input, periodEnd: input.periodStart }]) expect((await POST(post(body))).status).toBe(400);
    expect((await POST(post(input, { origin: "https://foreign.test" }))).status).toBe(403); expect((await POST(post(input, { "content-type": "text/plain" }))).status).toBe(415); expect((await POST(post({ ...input, extra: "x".repeat(9000) }))).status).toBe(413); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("ordinary graph remains private and exact scoped", async () => {
    const response = await GET(new Request(`${url}?workspaceId=${workspaceId}`)); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.read).toHaveBeenCalledWith({ userId, verifiedEmail: "owner@example.test" }, workspaceId);
  });
  it("records operator-selected explicit values with actual operator identity and no HTTP actor override", async () => {
    const command = { action: "record_price", version: "written-price-version", amountCents: 1700, currency: "cad", definitionId: null, effectiveFrom: "2099-01-01T00:00:00Z", effectiveUntil: null };
    expect((await operatorPOST(post(command))).status).toBe(200); expect(mocks.record).toHaveBeenCalledWith({ userId, verifiedEmail: "operator@example.test" }, command);
    expect((await operatorPOST(post({ ...command, approvedBy: other }))).status).toBe(400); mocks.operator.mockResolvedValue(null); expect((await operatorPOST(post(command))).status).toBe(403);
  });
  it("requires the separately enabled actual operator payout action with no supplied actor/recipient/amount", async () => {
    const command = { payoutId: other, profileVersion: "explicit-approved-profile" };
    vi.stubEnv("STRELVA_CONNECT", "1"); vi.stubEnv("STRELVA_SPLIT_PAYOUT_EXECUTION", "0");
    expect((await payoutPOST(post(command))).status).toBe(503); expect(mocks.execute).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_SPLIT_PAYOUT_EXECUTION", "1");
    expect((await payoutPOST(post(command))).status).toBe(200); expect(mocks.execute).toHaveBeenCalledWith({ userId, verifiedEmail: "operator@example.test" }, command);
    for (const changed of [{ userId: other }, { amountCents: 1 }, { recipient: "acct_Forged" }]) expect((await payoutPOST(post({ ...command, ...changed }))).status).toBe(400);
    mocks.operator.mockResolvedValue(null); expect((await payoutPOST(post(command))).status).toBe(403);
  });
});
