import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverToolNotice, retryToolNotices } from "@/products/applications/notice-delivery";
import { handledToolNotice, readToolNoticeFailures, readToolNoticeHandled } from "@/platform/catalog-reports/tool-notices";
import type { SendEmailInput } from "@/platform/infra/email/send";

const mocks = vi.hoisted(() => ({ db: vi.fn(), released: vi.fn(), override: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
vi.mock("@/platform/release-flags/store", async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), workspaceReleaseFlagEnabled: mocks.released }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: mocks.override }));
const noticeId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const input: SendEmailInput = { audience: "client", tenantId: "site", to: "staff@example.test", subject: "Intake: Acme",
  idempotencyKey: `internal-tool-notice:${noticeId}`, tags: { kind: "internal_tool_notice" },
  options: { heading: "New submission: Acme", paragraphs: ["Open the tool to confirm requirements."], button: { label: "Sign in", url: "https://app.example.test/sign-in" } } };
const actor = { userId: noticeId, verifiedEmail: "owner@example.test" };
const lease = { noticeId, workspaceId, lease: noticeId, delivery: input };
const rpc = vi.fn();
beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1"); vi.stubEnv("STRELVA_INTERNAL_TOOL_NOTICES_RELEASE", "1");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  mocks.released.mockResolvedValue(true); mocks.override.mockResolvedValue("inherit"); mocks.db.mockReturnValue({ rpc });
  rpc.mockReset().mockImplementation(async name => ({ data: name === "lease_internal_tool_notice" ? lease : true, error: null }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("durable internal tool notices", () => {
  it("retries the frozen first transport, preserving provider idempotency", async () => {
    const send = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "message", acceptedAt: "2026-10-07T12:00:00Z" }));
    expect(await deliverToolNotice({ rpc }, noticeId, workspaceId, undefined, send)).toBe("sent");
    expect(send).toHaveBeenCalledWith(input);
    expect(rpc).toHaveBeenCalledWith("finish_internal_tool_notice_delivery", expect.objectContaining({ p_status: "sent", p_lease: noticeId, p_provider_message_id: "message" }));
  });
  it("does not replay a concurrent, accepted or unconfirmed send refused by the lease", async () => {
    rpc.mockResolvedValue({ data: null, error: null }); const send = vi.fn();
    expect(await deliverToolNotice({ rpc }, noticeId, workspaceId, input, send)).toBe("duplicate"); expect(send).not.toHaveBeenCalled();
  });
  it.each(["EMAIL_SENDING_ENABLED", "CUSTOMER_EMAIL_ENABLED"])("records suppression with %s off even if tenant is on", async key => {
    vi.stubEnv(key, "false"); mocks.override.mockResolvedValue("on"); const send = vi.fn();
    expect(await deliverToolNotice({ rpc }, noticeId, workspaceId, input, send)).toBe("suppressed"); expect(send).not.toHaveBeenCalled();
  });
  it("obeys a tenant off override", async () => {
    mocks.override.mockResolvedValue("off"); const send = vi.fn();
    expect(await deliverToolNotice({ rpc }, noticeId, workspaceId, input, send)).toBe("suppressed"); expect(send).not.toHaveBeenCalled();
  });
  it("does not turn a confirmed provider acceptance into a retry when receipt storage rejects", async () => {
    rpc.mockImplementation(async name => name === "finish_internal_tool_notice_delivery" ? Promise.reject(new Error("connection lost")) : { data: lease, error: null });
    const send = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "message", acceptedAt: "2026-10-07T12:00:00Z" }));
    expect(await deliverToolNotice({ rpc }, noticeId, workspaceId, input, send)).toBe("sent"); expect(send).toHaveBeenCalledTimes(1);
  });
  it("records known provider failures without storing provider error text", async () => {
    expect(await deliverToolNotice({ rpc }, noticeId, workspaceId, input, vi.fn(async () => { throw new Error("private provider response"); }))).toBe("failed");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("private provider response");
  });
  it("flags off perform no retry, history or operator storage reads", async () => {
    vi.stubEnv("STRELVA_INTERNAL_TOOL_NOTICES_RELEASE", "0");
    expect(await retryToolNotices()).toEqual({ processed: 0, failed: 0 });
    expect(await readToolNoticeHandled(actor, workspaceId, "2026-10-07T00:00:00Z")).toEqual([]);
    expect(await readToolNoticeFailures(actor)).toEqual([]); expect(mocks.db).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("a per-business kill switch blocks retries without claiming or sending", async () => {
    mocks.released.mockResolvedValue(false); rpc.mockResolvedValue({ data: [{ noticeId, workspaceId }], error: null });
    expect(await retryToolNotices()).toEqual({ processed: 0, failed: 0 }); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("a handled receipt distinguishes pending, held, failed and accepted outcomes", () => {
    const row = { id: noticeId, workspaceId, workId: noticeId, recordId: "one", title: "Intake", recipient: "staff@example.test", attempts: 3, at: "2026-10-07T12:00:00Z" };
    expect(handledToolNotice({ ...row, status: "failed" }).sentence).toContain("operator review");
    expect(handledToolNotice({ ...row, status: "pending" }).sentence).toContain("not confirmed");
    expect(handledToolNotice({ ...row, status: "suppressed" }).sentence).toContain("paused");
    expect(handledToolNotice({ ...row, status: "sent" }).evidence?.readBack).toBe("not_checked");
  });
});
