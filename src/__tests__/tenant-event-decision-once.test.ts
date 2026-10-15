import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const ACTOR = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };

const mockWorkspaceForTenant = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ openForSource: vi.fn(), decide: vi.fn() }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: mockWorkspaceForTenant }));
vi.mock("@/server/needs-you/server", () => ({ needsYouService: () => service, needsYouStore: {} }));

const item = (over: Record<string, unknown> = {}) => ({ id: "bbbbbbbb-0000-4000-8000-000000000001", state: "open", route: "owner_decides", revisionHash: "a".repeat(64), outcomeReason: null, ...over });
let fallback: ReturnType<typeof vi.fn>;

async function decide(over: Record<string, unknown> = {}) {
  const { decideTenantEventOnce } = await import("@/server/needs-you/tenant-event-decision");
  return decideTenantEventOnce({ tenantId: "gldf", eventId: "evt_1", action: "approved", by: { kind: "session", actor: ACTOR }, fallback: fallback as never, ...over });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRELVA_ONE_APPROVAL_PATH = "1";
  process.env.STRELVA_NEEDS_YOU_RELEASE = "1";
  fallback = vi.fn(async () => ({ changed: true, reason: "fallback" }));
  mockWorkspaceForTenant.mockResolvedValue(WS);
  service.openForSource.mockResolvedValue(item());
  service.decide.mockResolvedValue({ status: "done", item: item({ state: "approved" }) });
});
afterEach(() => {
  delete process.env.STRELVA_ONE_APPROVAL_PATH;
  delete process.env.STRELVA_NEEDS_YOU_RELEASE;
  vi.resetModules();
});

describe("decideTenantEventOnce", () => {
  it("flag off calls the fallback only", async () => {
    process.env.STRELVA_ONE_APPROVAL_PATH = "0";
    expect(await decide()).toEqual({ changed: true, reason: "fallback" });
    expect(service.decide).not.toHaveBeenCalled();
    expect(mockWorkspaceForTenant).not.toHaveBeenCalled();
  });

  it("a linked tenant with an open owner item decides through the item", async () => {
    const result = await decide();
    expect(fallback).not.toHaveBeenCalled();
    expect(service.openForSource).toHaveBeenCalledWith(WS, "tenant_event", "gldf:evt_1");
    expect(service.decide).toHaveBeenCalledWith({ workspaceId: WS, itemId: item().id, revision: "a".repeat(64), decision: "approve", by: { kind: "session", actor: ACTOR } });
    expect(result).toEqual({ changed: true, decisionId: item().id });
  });

  it("dismissed is a not_yet decision and an agency decides as the agency", async () => {
    await decide({ action: "dismissed", by: { kind: "agency", actor: ACTOR } });
    expect(service.decide).toHaveBeenCalledWith(expect.objectContaining({ decision: "not_yet", by: { kind: "agency", actor: ACTOR } }));
  });

  it("a known workspace skips the tenant lookup", async () => {
    mockWorkspaceForTenant.mockResolvedValue(null);
    await decide({ workspaceId: WS });
    expect(mockWorkspaceForTenant).not.toHaveBeenCalled();
    expect(service.decide).toHaveBeenCalled();
  });

  it("an unlinked tenant calls the fallback", async () => {
    mockWorkspaceForTenant.mockResolvedValue(null);
    expect(await decide()).toEqual({ changed: true, reason: "fallback" });
    expect(service.decide).not.toHaveBeenCalled();
  });

  it("a Strelva reviews item or no item calls the fallback", async () => {
    service.openForSource.mockResolvedValue(item({ route: "strelva_reviews" }));
    await decide();
    service.openForSource.mockResolvedValue(null);
    await decide();
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(service.decide).not.toHaveBeenCalled();
  });

  it("a lookup failure calls the fallback", async () => {
    service.openForSource.mockRejectedValue(new Error("down"));
    expect(await decide()).toEqual({ changed: true, reason: "fallback" });
  });

  it.each([
    ["done_unverified", { changed: true, reason: "accepted_unverified" }],
    ["already_handled", { changed: false, reason: "already_resolved" }],
    ["changed", { changed: false, reason: "stale_superseded" }],
    ["forbidden", { changed: false, reason: "permission_denied" }],
    ["not_owner", { changed: false, reason: "permission_denied" }],
    ["sign_in", { changed: false, reason: "permission_denied" }],
  ])("maps %s", async (status, expected) => {
    service.decide.mockResolvedValue({ status, item: item() });
    expect(await decide()).toEqual({ ...expected, decisionId: item().id });
  });

  it("a failed decision carries the recorded reason", async () => {
    service.decide.mockResolvedValue({ status: "failed", item: item({ outcomeReason: "resolver_threw" }) });
    expect(await decide()).toMatchObject({ changed: false, reason: "resolver_threw" });
  });
});
