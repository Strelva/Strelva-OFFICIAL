import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { needsYouMemoryStore } from "./support/needs-you-memory";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { verifyWorkspaceApproveToken } from "@/lib/approve-link";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), release: vi.fn(), override: vi.fn(), event: vi.fn(), record: vi.fn(), upsert: vi.fn(),
}));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: mocks.release }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: mocks.override }));
vi.mock("@/lib/events", () => ({ getEventRaw: mocks.event }));
vi.mock("@/lib/google-access", () => ({ recordGoogleConnection: mocks.record }));
vi.mock("@/platform/account-bindings/store", () => ({ googleBindingsEnabled: () => process.env.STRELVA_GOOGLE_BINDINGS === "1", bindingEncryptionReady: () => !!process.env.SECRETS_ENC_KEY, upsertGoogleBinding: mocks.upsert }));

import { publishingDecisionDeliveryAllowed, publishingNoticesEnabled, requiresGoogleReapprovalAfterReconnect } from "@/platform/needs-you/publishing-delivery";
import { chaseGoogleReconnectNotices, finishGoogleReconnect, GOOGLE_RECONNECT_COOKIE, reconnectHash, reconnectStore, signReconnectToken, verifyReconnectToken, type ReconnectTarget } from "@/products/publishing/reconnect";
import { GET as reconnectGet, POST as reconnectPost } from "@/app/api/publishing/google/reconnect/route";
import { GET as reconnectCallback } from "@/app/api/publishing/google/reconnect/callback/route";

const WS = "ac000000-0000-4000-8000-000000000010";
const ID = "ac000000-0000-4000-8000-000000000011";
const target: ReconnectTarget = { id: ID, bindingId: "ac000000-0000-4000-8000-000000000012", workspaceId: WS,
  tenantId: "fixture-firm", tenantStableId: "ac000000-0000-4000-8000-000000000013", recipient: "owner@example.test",
  openedAt: "2026-10-05T11:00:00Z", expiresAt: "2026-10-19T11:00:00Z", noticeStatus: "not_sent" };
const clock = Date.parse("2026-10-06T11:00:00Z");
const accepted = { status: "accepted" as const, providerMessageId: "fixture-receipt", acceptedAt: new Date(clock).toISOString() };

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(clock); vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_PUBLISHING_RELEASE", "1"); vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
  vi.stubEnv("STRELVA_PUBLISHING_NOTICES_SEND", "0"); vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  vi.stubEnv("OAUTH_STATE_SECRET", "fixture-signing-secret"); vi.stubEnv("APPROVE_LINK_SECRET", "fixture-approval-secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test"); vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("SECRETS_ENC_KEY", "fixture-encryption-enabled");
  mocks.release.mockResolvedValue(true); mocks.override.mockResolvedValue("inherit"); mocks.record.mockResolvedValue({ binding: "written" });
  mocks.rpc.mockResolvedValue({ data: target, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("signed owner reconnect", () => {
  it("binds purpose, recipient, workspace and expiry; rejects tampering and other token families", () => {
    const link = signReconnectToken(target, "link");
    expect(verifyReconnectToken(link, "link")).toEqual({ id: ID, workspaceId: WS, recipient: target.recipient, nonce: "" });
    expect(verifyReconnectToken(link, "state")).toBeNull();
    expect(verifyWorkspaceApproveToken(link)).toBeNull();
    expect(verifyReconnectToken(`${link}x`, "link")).toBeNull();
    expect(verifyReconnectToken(link, "link", Date.parse(target.expiresAt))).toBeNull();
    vi.stubEnv("OAUTH_STATE_SECRET", ""); vi.stubEnv("INTERNAL_API_SECRET", "");
    expect(verifyReconnectToken(link, "link")).toBeNull();
  });
  it("GET is read-only and an owner with no session can confirm then start Google", async () => {
    const token = signReconnectToken(target, "link");
    const response = await reconnectGet(new Request(`https://app.example.test/api/publishing/google/reconnect?token=${token}`));
    expect(response.status).toBe(200); expect(await response.text()).toContain("Continue to Google");
    expect(mocks.rpc.mock.calls[0][1].p_action).toBe("read");
    const begun = await reconnectPost(new Request("https://app.example.test/api/publishing/google/reconnect", { method: "POST", headers: { origin: "https://app.example.test" }, body: new URLSearchParams({ token }) }));
    expect(begun.status).toBe(303); expect(begun.headers.get("location")).toContain("accounts.google.com");
    expect(begun.headers.get("set-cookie")).toContain("HttpOnly");
    expect(mocks.rpc.mock.calls.at(-1)?.[1].p_action).toBe("begin");
  });
  it("flags off, changed owner, missing encryption and cross-origin POST cannot begin", async () => {
    const token = signReconnectToken(target, "link");
    const request = () => new Request(`https://app.example.test/api/publishing/google/reconnect?token=${token}`);
    mocks.release.mockResolvedValue(false); expect((await reconnectGet(request())).status).toBe(410); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.release.mockResolvedValue(true); mocks.rpc.mockResolvedValue({ data: { ...target, recipient: "new-owner@example.test" }, error: null });
    expect((await reconnectGet(request())).status).toBe(410);
    vi.stubEnv("SECRETS_ENC_KEY", ""); mocks.rpc.mockClear(); expect((await reconnectGet(request())).status).toBe(410); expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await reconnectPost(new Request("https://app.example.test/api/publishing/google/reconnect", { method: "POST", headers: { origin: "https://attacker.example.test" }, body: new URLSearchParams({ token }) }))).status).toBe(403);
  });
  it("callback requires browser binding and refuses consumed state without a provider call", async () => {
    const state = signReconnectToken(target, "state", "browser-nonce"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const url = `https://app.example.test/api/publishing/google/reconnect/callback?state=${state}&code=fixture-code`;
    expect((await reconnectCallback(new NextRequest(url))).status).toBe(410); expect(fetcher).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await reconnectCallback(new NextRequest(url, { headers: { cookie: `${GOOGLE_RECONNECT_COOKIE}=browser-nonce` } }))).status).toBe(410);
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_action: "consume", p_input: { browserHash: reconnectHash("browser-nonce"), stateHash: reconnectHash(state) } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses a Google token double, preserves location, and refuses absent publishing scope or a failed workspace save", async () => {
    const tokenResponse = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, scope: "https://www.googleapis.com/auth/business.manage" };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenResponse)));
    await finishGoogleReconnect(target, "fixture-code", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(mocks.record).toHaveBeenCalledWith(expect.not.objectContaining({ accountId: expect.anything(), locationId: expect.anything() }));
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...tokenResponse, scope: "other-scope" })));
    await expect(finishGoogleReconnect(target, "fixture-code", fetcher)).rejects.toThrow("permission");
    fetcher.mockResolvedValue(new Response(JSON.stringify(tokenResponse))); mocks.record.mockResolvedValue({ binding: "failed" });
    await expect(finishGoogleReconnect(target, "fixture-code", fetcher)).rejects.toThrow("workspace");
    fetcher.mockResolvedValue(new Response("no", { status: 403 })); await expect(finishGoogleReconnect(target, "fixture-code", fetcher)).rejects.toThrow("Google");
  });
  it("storage fails closed when unavailable or malformed", async () => {
    await expect(reconnectStore(null).target("read", ID)).rejects.toThrow("unavailable");
    mocks.rpc.mockResolvedValue({ data: { id: ID }, error: null }); await expect(reconnectStore().target("consume", ID)).rejects.toThrow();
  });
});

describe("publishing delivery gates and existing digest", () => {
  it("requires dedicated flag, both global email gates, workspace gate and tenant override", async () => {
    expect(await publishingNoticesEnabled(WS, target.tenantId)).toBe(false);
    vi.stubEnv("STRELVA_PUBLISHING_NOTICES_SEND", "1"); expect(await publishingNoticesEnabled(WS, target.tenantId)).toBe(true);
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false"); mocks.override.mockResolvedValue("on"); expect(await publishingNoticesEnabled(WS, target.tenantId)).toBe(false);
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "false"); expect(await publishingNoticesEnabled(WS, target.tenantId)).toBe(false);
    vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true"); mocks.override.mockResolvedValue("off"); expect(await publishingNoticesEnabled(WS, target.tenantId)).toBe(false);
    mocks.override.mockResolvedValue("inherit"); mocks.release.mockResolvedValue(false); expect(await publishingNoticesEnabled(WS, target.tenantId)).toBe(false);
  });
  it("publishing source IDs are resolved to the event while legacy items keep their original gate", async () => {
    const row = { sourceLifecycle: "tenant_event", sourceId: "fixture-firm:event-id", workspaceId: WS, recipient: { tenantId: "fixture-firm" } };
    mocks.event.mockResolvedValue({ metadata: { kind: "workspace_google_listing_draft" } });
    expect(await publishingDecisionDeliveryAllowed(row as never)).toBe(false); expect(mocks.event).toHaveBeenCalledWith("event-id");
    mocks.event.mockResolvedValue({ metadata: { kind: "review_reply_draft" } }); expect(await publishingDecisionDeliveryAllowed(row as never)).toBe(true);
  });
  it("gated rows stay unsent, then existing morning digest contains each revision-bound approve link and records delivery", async () => {
    const memory = needsYouMemoryStore({ clock: { now: clock } });
    const rows = [];
    for (const sourceId of ["fixture-firm:blog", "fixture-firm:newsletter"]) rows.push(await memory.store.open(WS, { kind: "customer.broadcast", route: "owner_decides", title: sourceId, approveEffect: "Publish after approval", notYetEffect: "Keep draft", sourceLifecycle: "tenant_event", sourceId, revisionHash: "a".repeat(64), urgent: false, adminMayDecide: true }));
    memory.store.dueForDelivery = async () => rows.map(row => ({ ...row, businessName: "Fixture firm", timezone: "America/New_York", recipient: { email: target.recipient, from: "record", tenantId: target.tenantId! } }));
    memory.store.recordDelivery = vi.fn(async (_ws, id) => rows.find(row => row.id === id)!);
    const send = vi.fn().mockResolvedValue(accepted); let deliver = false;
    const service = createNeedsYouService({ store: memory.store, adapters: [], appOrigin: "https://app.example.test", now: () => clock, sendEmail: send, canDeliver: async () => deliver });
    expect((await service.chase()).ownerNotTold).toBe(2); expect(send).not.toHaveBeenCalled(); expect(memory.store.recordDelivery).not.toHaveBeenCalled();
    deliver = true; expect((await service.chase()).digests).toBe(1); expect(send).toHaveBeenCalledTimes(1);
    const decisions = send.mock.calls[0][0].options.decisions;
    expect(decisions).toHaveLength(2);
    for (const item of decisions) expect(verifyWorkspaceApproveToken(new URL(item.approve.url).searchParams.get("token")!)).toMatchObject({ workspaceId: WS, recipient: target.recipient, revision: "a".repeat(64) });
    expect(memory.store.recordDelivery).toHaveBeenCalledTimes(2);
  });
  it("outage notice is gated, idempotent and never resends accepted notices", async () => {
    const send = vi.fn().mockResolvedValue(accepted);
    const store = { list: vi.fn(async () => [target.bindingId]), target: vi.fn(async () => target), notice: vi.fn(), noticeFailed: vi.fn(), restored: vi.fn() };
    expect(await chaseGoogleReconnectNotices({ store, send, enabled: async () => false })).toMatchObject({ suppressed: 1 }); expect(send).not.toHaveBeenCalled();
    await chaseGoogleReconnectNotices({ store, send, enabled: async () => true }); expect(send.mock.calls[0][0].idempotencyKey).toBe(`publishing-google-outage:${ID}`);
    store.target.mockResolvedValue({ ...target, noticeStatus: "accepted" }); await chaseGoogleReconnectNotices({ store, send, enabled: async () => true }); expect(send).toHaveBeenCalledTimes(1);
    vi.stubEnv("STRELVA_PUBLISHING_RELEASE", "0"); store.list.mockClear(); await chaseGoogleReconnectNotices({ store, send }); expect(store.list).not.toHaveBeenCalled();
  });
  it("requires a fresh approval for approval older than seven days after reconnect", () => {
    const restored = new Date(clock).toISOString();
    expect(requiresGoogleReapprovalAfterReconnect("2026-09-20T00:00:00Z", restored, clock)).toBe(true);
    expect(requiresGoogleReapprovalAfterReconnect("2026-10-05T00:00:00Z", restored, clock)).toBe(false);
    expect(requiresGoogleReapprovalAfterReconnect(null, restored, clock)).toBe(true);
  });
});
