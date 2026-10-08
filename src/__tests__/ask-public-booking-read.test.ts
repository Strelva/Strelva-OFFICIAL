import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const mocks = vi.hoisted(() => ({ member: vi.fn(), result: { data: [] as unknown[], error: null as { message: string } | null }, select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn(), order: vi.fn(), limit: vi.fn(), from: vi.fn() }));
vi.mock("@/platform/workspaces/repository", () => ({ assertWorkspaceMember: mocks.member }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ from: mocks.from }) }));
import { readWorkspacePublicBookingReceipts } from "@/products/scheduling/public-booking-admin";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "owner@example.test" };
const range = { from: "2026-10-07T12:00:00Z", to: "2026-11-06T12:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.result = { data: [], error: null };
  const query = { select: mocks.select, eq: mocks.eq, gte: mocks.gte, lt: mocks.lt, order: mocks.order, limit: mocks.limit };
  for (const fn of [mocks.from, mocks.select, mocks.eq, mocks.gte, mocks.lt, mocks.order]) fn.mockReturnValue(query);
  mocks.limit.mockImplementation(async () => mocks.result);
  mocks.member.mockResolvedValue(undefined);
});
const row = { id: "44444444-4444-4444-8444-444444444444", business_workspace_id: workspaceId, work_id: workId, calendar_request_id: "request", tenant_id_at_reservation: "example", title: "Consulting", start_at: "2026-10-08T12:00:00Z", status: "confirmed", updated_at: range.from, management_token_ciphertext: "must-not-return", client_email: "must-not-return" };
describe("Ask secret-free public booking receipt read", () => {
  it("checks membership and bounds the source to that workspace and exact range; returns no tokens or visitor details", async () => {
    mocks.result.data = [row];
    const result = await readWorkspacePublicBookingReceipts(actor, workspaceId, range);
    expect(mocks.member).toHaveBeenCalledWith(actor, workspaceId);
    expect(mocks.eq).toHaveBeenCalledWith("business_workspace_id", workspaceId);
    expect(mocks.gte).toHaveBeenCalledWith("start_at", range.from);
    expect(mocks.lt).toHaveBeenCalledWith("start_at", range.to);
    expect(mocks.select).toHaveBeenCalledWith("id,business_workspace_id,work_id,calendar_request_id,tenant_id_at_reservation,title,start_at,status,updated_at");
    expect(result).toEqual({ truncated: false, rows: [{ id: row.id, workId, requestId: "request", tenantId: "example", title: "Consulting", start: row.start_at, status: "confirmed" }] });
  });
  it("does no database read after authority denial", async () => {
    mocks.member.mockRejectedValueOnce(new WorkspaceAccessError());
    await expect(readWorkspacePublicBookingReceipts(actor, workspaceId, range)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("fails closed on source error or a returned foreign-workspace row", async () => {
    mocks.result.error = { message: "unavailable" };
    await expect(readWorkspacePublicBookingReceipts(actor, workspaceId, range)).rejects.toThrow("could not be read");
    mocks.result = { error: null, data: [{ ...row, business_workspace_id: workId }] };
    await expect(readWorkspacePublicBookingReceipts(actor, workspaceId, range)).rejects.toThrow("scope changed");
  });
});
