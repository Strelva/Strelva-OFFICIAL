import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server actions behind the human-minute log. Invariants:
//  - super-admin is re-verified independently (the /admin layout gate does not
//    protect a server action POST surface);
//  - the verified session identity, not client input, is sent to the SQL boundary;
//  - storage failures report unavailable and nothing is claimed as saved.

const mockIsSuperAdmin = vi.fn();
const mockActor = vi.fn();
const mockRpc = vi.fn();
const mockRevalidate = vi.fn();
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: () => mockIsSuperAdmin() }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: () => mockActor() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => mockRevalidate(...args) }));

import { recordBusinessEffortAction, voidBusinessEffortAction } from "@/app/admin/work/effort-actions";

const OPERATOR = { userId: "00000000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" };
const BUSINESS = "10000000-0000-4000-8000-00000000000a";
const ENTRY = "20000000-0000-4000-8000-000000000001";
const today = new Date().toISOString().slice(0, 10);
const input = { entryId: ENTRY, businessId: BUSINESS, minutes: 25, category: "change" as const, occurredOn: today };
const row = { id: ENTRY, businessId: BUSINESS, minutes: 25, category: "change", occurredOn: today, note: null,
  recordedBy: OPERATOR.userId, recordedAt: `${today}T12:00:00+00:00`, void: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mockIsSuperAdmin.mockResolvedValue(true);
  mockActor.mockResolvedValue(OPERATOR);
  mockRpc.mockResolvedValue({ data: row, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("recordBusinessEffortAction", () => {
  it("records through the SQL boundary with the verified operator", async () => {
    await expect(recordBusinessEffortAction(input)).resolves.toEqual({ ok: true, message: "Recorded 25 minutes." });
    expect(mockRpc).toHaveBeenCalledWith("record_business_effort", expect.objectContaining({
      p_user_id: OPERATOR.userId, p_verified_email: OPERATOR.verifiedEmail, p_business_id: BUSINESS, p_minutes: 25,
    }));
    expect(mockRevalidate).toHaveBeenCalledWith("/admin/work");
  });

  it("rejects a non-super-admin without touching storage", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const result = await recordBusinessEffortAction(input);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/super admin/i);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockActor).not.toHaveBeenCalled();
  });

  it("rejects a super-admin bypass without a verified session identity", async () => {
    mockActor.mockResolvedValue(null);
    expect((await recordBusinessEffortAction(input)).ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects invalid minutes before storage", async () => {
    const result = await recordBusinessEffortAction({ ...input, minutes: 0 });
    expect(result).toEqual({ ok: false, message: "Check the minutes, category, date and note." });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("reports an unknown business from the SQL boundary", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "business_effort_business_not_found" } });
    expect(await recordBusinessEffortAction(input)).toEqual({ ok: false, message: "That customer business was not found." });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("reports revoked super-admin authority from the SQL boundary", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "business_effort_access_denied" } });
    expect((await recordBusinessEffortAction(input)).message).toMatch(/super admin/i);
  });

  it("reports unavailable storage without claiming a save", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const result = await recordBusinessEffortAction(input);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/unavailable\. Nothing was saved/);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("stays closed while the workspace release is off", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "");
    expect((await recordBusinessEffortAction(input)).ok).toBe(false);
    expect(mockIsSuperAdmin).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("voidBusinessEffortAction", () => {
  it("voids with a reason and keeps the entry in history", async () => {
    mockRpc.mockResolvedValue({ data: { ...row, void: { reason: "Duplicate", voidedBy: OPERATOR.userId, voidedAt: `${today}T13:00:00+00:00` } }, error: null });
    const result = await voidBusinessEffortAction({ entryId: ENTRY, reason: "Duplicate" });
    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("void_business_effort", { p_user_id: OPERATOR.userId, p_verified_email: OPERATOR.verifiedEmail, p_entry_id: ENTRY, p_reason: "Duplicate" });
  });

  it("rejects a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    expect((await voidBusinessEffortAction({ entryId: ENTRY, reason: "Duplicate" })).ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("reports a conflicting second void", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "business_effort_conflict" } });
    expect((await voidBusinessEffortAction({ entryId: ENTRY, reason: "Other" })).message).toMatch(/already saved differently/);
  });
});
