import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/tenants/[id]/owner-invitations/route";
import { loadOwnerInvitations } from "@/platform/owner-entry/operator-invitations";
import { setBusinessOwnershipDb } from "@/platform/workspaces/business-ownership";

const mocks = vi.hoisted(() => ({ superAdmin: vi.fn(), operator: vi.fn(), workspace: vi.fn(), send: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.superAdmin, getCurrentUserEmail: mocks.operator }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: mocks.workspace }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmailWithReceipt: mocks.send }));

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const OPERATOR = "33333333-3333-4333-8333-333333333333";
const STABLE = "44444444-4444-4444-8444-444444444444";
const ctx = { params: Promise.resolve({ id: "test-business" }) };
function state(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: WORKSPACE, workspaceName: "Test Business", operatorId: OPERATOR,
    hasOwner: false, exited: false, recipient: { email: "owner@example.test", name: "Owner", from: "record" },
    tenants: [{ tenantId: "test-business", tenantStableId: STABLE, siteName: "Test Site" }], pending: [],
    ...overrides,
  };
}
function request(body: unknown = { action: "invite", jacobApproved: true }, origin: string | null = "https://admin.example.test") {
  return new Request("https://admin.example.test/api/admin/tenants/test-business/owner-invitations", {
    method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
  });
}
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
let rpc: ReturnType<typeof vi.fn<Rpc>>;
const created = () => rpc.mock.calls.filter(([name]) => name === "create_operator_owner_invitation");

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_OWNER_ENTRY", "1");
  vi.stubEnv("STRELVA_OWNER_INVITATIONS_RELEASE", "1");
  mocks.superAdmin.mockResolvedValue(true);
  mocks.operator.mockResolvedValue("operator@example.test");
  mocks.workspace.mockResolvedValue(WORKSPACE);
  mocks.send.mockResolvedValue({ status: "accepted", providerMessageId: "test-message", acceptedAt: "2026-10-01" });
  rpc = vi.fn<Rpc>(async (name, args) => {
    if (name === "read_operator_owner_invitation_state") return { data: state(), error: null };
    if (name === "create_operator_owner_invitation") return { data: {
      invitationId: INVITATION, workspaceId: WORKSPACE, workspaceName: "Test Business", recipientEmail: args.p_recipient_email,
      role: "owner", status: "pending", expiresAt: args.p_expires_at, createdAt: "2026-10-01", createdBy: OPERATOR,
      tenants: state().tenants,
    }, error: null };
    if (name === "revoke_operator_owner_invitation") return { data: "revoked", error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  setBusinessOwnershipDb({ rpc });
});
afterEach(() => { setBusinessOwnershipDb(null); vi.unstubAllEnvs(); });

describe("owner invitations release gate", () => {
  for (const [name, value] of [
    ["STRELVA_OWNER_INVITATIONS_RELEASE", undefined], ["STRELVA_OWNER_INVITATIONS_RELEASE", "0"],
    ["STRELVA_WORKSPACE_RELEASE", "0"], ["STRELVA_OWNER_ENTRY", undefined], ["STRELVA_OWNER_ENTRY", "0"],
  ] as const) {
    it(`${name}=${value ?? "unset"} hides the panel and refuses reads/writes before any work`, async () => {
      vi.stubEnv(name, value);
      expect(await loadOwnerInvitations("test-business")).toBeNull();
      expect((await GET(new Request("https://admin.example.test/test"), ctx)).status).toBe(404);
      expect((await POST(request(), ctx)).status).toBe(404);
      expect(mocks.superAdmin).not.toHaveBeenCalled();
      expect(mocks.operator).not.toHaveBeenCalled();
      expect(mocks.workspace).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    });
  }
});

describe("operator ownership authorization", () => {
  it("reads scoped invitation state without creating a token or sending email", async () => {
    const response = await GET(new Request("https://admin.example.test/test"), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ state: state() });
    expect(created()).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses a signed-out or ordinary user before resolving the business", async () => {
    mocks.superAdmin.mockResolvedValue(false);
    expect((await GET(new Request("https://admin.example.test/test"), ctx)).status).toBe(403);
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires the session's verified operator address (including dev bypass)", async () => {
    mocks.operator.mockResolvedValue(null);
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires existing admin membership through the state RPC, even for a super-admin", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "operator_owner_invitation_operator_required" } });
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(await loadOwnerInvitations("test-business")).toEqual({ kind: "denied" });
    expect(rpc).toHaveBeenCalledWith("read_operator_owner_invitation_state", {
      p_operator_email: "operator@example.test", p_workspace_id: WORKSPACE,
    });
    expect(created()).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses an unconverted tenant", async () => {
    mocks.workspace.mockResolvedValue(null);
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(await loadOwnerInvitations("test-business")).toEqual({ kind: "unconverted" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a resolver mismatch across businesses", async () => {
    rpc.mockResolvedValue({ data: state({ tenants: [{ tenantId: "another-business", tenantStableId: STABLE, siteName: "Other Site" }] }), error: null });
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(created()).toHaveLength(0);
  });

  it("shows unavailable state when ownership storage fails without writing or emailing", async () => {
    rpc.mockRejectedValue(new Error("storage down"));
    expect((await POST(request(), ctx)).status).toBe(503);
    expect(await loadOwnerInvitations("test-business")).toEqual({ kind: "unavailable" });
    expect(created()).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("owner invitation mutations", () => {
  it("rejects invalid tenant scope before resolving a business", async () => {
    const invalid = { params: Promise.resolve({ id: "../other-business" }) };
    expect((await GET(new Request("https://admin.example.test/test"), invalid)).status).toBe(400);
    expect((await POST(request(), invalid)).status).toBe(400);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  for (const origin of [null, "https://other.example.test", "null", "https://admin.example.test.attacker.test"]) {
    it(`rejects invalid origin ${origin} before reading or writing`, async () => {
      expect((await POST(request(undefined, origin), ctx)).status).toBe(403);
      expect(rpc).not.toHaveBeenCalled();
      expect(mocks.superAdmin).not.toHaveBeenCalled();
    });
  }

  for (const body of [null, [], {}, { action: "invite" }, { action: "invite", jacobApproved: false },
    { action: "invite", jacobApproved: true, sendEmail: "true" }, { action: "invite", jacobApproved: true, recipientEmail: "bad" },
    { action: "invite", jacobApproved: true, workspaceId: WORKSPACE }, { action: "revoke", invitationId: "bad" }]) {
    it(`rejects invalid request ${JSON.stringify(body)} before reading or writing`, async () => {
      expect((await POST(request(body), ctx)).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    });
  }

  it("rejects malformed JSON", async () => {
    const req = new Request("https://admin.example.test/test", { method: "POST", headers: { origin: "https://admin.example.test" }, body: "{" });
    expect((await POST(req, ctx)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("prepares a token for the record recipient with email false by default", async () => {
    const response = await POST(request(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.delivery).toEqual({ status: "not_sent", reason: "email_not_requested" });
    expect(body.acceptUrl).toMatch(/\/workspace\/invitations\/accept\/[A-Za-z0-9_-]{43}$/);
    expect(created()).toHaveLength(1);
    expect(created()[0]![1]).toMatchObject({ p_workspace_id: WORKSPACE, p_recipient_email: "owner@example.test", p_operator_email: "operator@example.test" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("explicit approved email sends through the existing tenant-aware transport and hides the bearer link", async () => {
    const response = await POST(request({ action: "invite", jacobApproved: true, sendEmail: true, recipientEmail: " Other@Example.test " }), ctx);
    const body = await response.json();
    expect(body.delivery).toEqual({ status: "sent", providerMessageId: "test-message" });
    expect(body).not.toHaveProperty("acceptUrl");
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "client", tenantId: "test-business", to: "other@example.test" }));
  });

  for (const failure of ["suppressed", "failed"]) {
    it(`returns honest not-sent status and recovery link when delivery is ${failure}`, async () => {
      if (failure === "suppressed") mocks.send.mockResolvedValue({ status: "suppressed", reason: "email_suppressed_or_unconfigured" });
      else mocks.send.mockRejectedValue(new Error("provider down"));
      const response = await POST(request({ action: "invite", jacobApproved: true, sendEmail: true }), ctx);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.delivery).toEqual({ status: "not_sent", reason: failure === "suppressed" ? "email_suppressed_or_unconfigured" : "provider down" });
      expect(body.acceptUrl).toContain("/workspace/invitations/accept/");
      expect(body.invitation.status).toBe("pending");
      expect(created()).toHaveLength(1);
    });
  }

  it("refuses an existing owner without creating or notifying", async () => {
    rpc.mockResolvedValue({ data: state({ hasOwner: true }), error: null });
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(created()).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  for (const conflict of ["operator_owner_invitation_pending", "workspace_exit_future_work_blocked"]) {
    it(`preserves the database's ${conflict} refusal and never sends`, async () => {
      const defaultRpc = rpc.getMockImplementation()!;
      rpc.mockImplementation((name, args) => name === "create_operator_owner_invitation"
        ? Promise.resolve({ data: null, error: { message: conflict } })
        : defaultRpc(name, args));
      expect((await POST(request({ action: "invite", jacobApproved: true, sendEmail: true }), ctx)).status).toBe(409);
      expect(mocks.send).not.toHaveBeenCalled();
    });
  }

  it("cannot revoke an invitation absent from the scoped business's pending set", async () => {
    expect((await POST(request({ action: "revoke", invitationId: INVITATION }), ctx)).status).toBe(409);
    expect(rpc.mock.calls.some(([name]) => name === "revoke_operator_owner_invitation")).toBe(false);
  });

  it("revokes a pending invitation through the existing RPC without emailing", async () => {
    rpc.mockImplementation(async (name) => name === "read_operator_owner_invitation_state"
      ? { data: state({ pending: [{ invitationId: INVITATION, recipientEmail: "owner@example.test", createdAt: "2026-10-01", expiresAt: "2026-10-15" }] }), error: null }
      : { data: "revoked", error: null });
    expect(await (await POST(request({ action: "revoke", invitationId: INVITATION }), ctx)).json()).toEqual({ status: "revoked" });
    expect(rpc).toHaveBeenCalledWith("revoke_operator_owner_invitation", { p_operator_email: "operator@example.test", p_invitation_id: INVITATION });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
