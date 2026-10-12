const admission = vi.hoisted(() => vi.fn(async () => undefined));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: admission }));
import { GET, POST } from "@/app/api/admin/tenants/[id]/owner-invitations/route";
import { loadOwnerInvitations } from "@/platform/owner-entry/operator-invitations";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { setBusinessOwnershipDb } from "@/platform/workspaces/business-ownership";

const mocks = vi.hoisted(() => ({ operatorContext: vi.fn(), workspace: vi.fn(), approval: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ getAuthenticatedOperatorContext: mocks.operatorContext }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: mocks.workspace }));
vi.mock("@/platform/workspaces/operator-approvals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/workspaces/operator-approvals")>()),
  recordOperatorActionApproval: mocks.approval,
}));

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const OPERATOR = "33333333-3333-4333-8333-333333333333";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const STABLE = "44444444-4444-4444-8444-444444444444";
const ctx = { params: Promise.resolve({ id: "test-business" }) };
const actor = { userId: OPERATOR, verifiedEmail: "operator@example.test" };
function state(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: WORKSPACE, workspaceName: "Test Business", operatorId: OPERATOR,
    hasOwner: false, exited: false,
    recipient: { email: "owner@example.test", name: "Owner", from: "record", source: "tenant_import", verified: false },
    tenants: [{ tenantId: "test-business", tenantStableId: STABLE, siteName: "Test Site" }], pending: [], ...overrides,
  };
}
function request(body: unknown = { action: "invite" }, origin: string | null = "https://admin.example.test") {
  return new Request("https://admin.example.test/api/admin/tenants/test-business/owner-invitations", {
    method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
  });
}
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
let rpc: ReturnType<typeof vi.fn<Rpc>>;
const issued = () => rpc.mock.calls.filter(([name]) => name === "create_operator_owner_invitation_approved");

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_OWNER_ENTRY", "1");
  vi.stubEnv("STRELVA_OWNER_INVITATIONS_RELEASE", "1");
  mocks.operatorContext.mockResolvedValue({ actor, email: actor.verifiedEmail, authTime: Math.floor(Date.now() / 1000) });
  mocks.workspace.mockResolvedValue(WORKSPACE);
  mocks.approval.mockResolvedValue({ approvalId: APPROVAL });
  rpc = vi.fn<Rpc>(async (name, args) => {
    if (name === "read_operator_owner_invitation_state") return { data: state(), error: null };
    if (name === "create_operator_owner_invitation_approved") return { data: {
      invitationId: INVITATION, workspaceId: WORKSPACE, workspaceName: "Test Business", recipientEmail: args.p_recipient_email,
      role: "owner", status: "pending", expiresAt: args.p_expires_at, createdAt: "2026-10-01", createdBy: OPERATOR,
      tenants: state().tenants,
    }, error: null };
    if (name === "revoke_operator_owner_invitation_audited") return { data: "revoked", error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  setBusinessOwnershipDb({ rpc });
});
afterEach(() => { setBusinessOwnershipDb(null); vi.unstubAllEnvs(); });

describe("owner invitations release gate", () => {
  it("hides reads and writes before resolving an operator while the release is off", async () => {
    vi.stubEnv("STRELVA_OWNER_INVITATIONS_RELEASE", "0");
    expect(await loadOwnerInvitations("test-business")).toBeNull();
    expect((await GET(new Request("https://admin.example.test/test"), ctx)).status).toBe(404);
    expect((await POST(request(), ctx)).status).toBe(404);
    expect(mocks.operatorContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a real authenticated operator and business admin scope", async () => {
    mocks.operatorContext.mockResolvedValue(null);
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
    mocks.operatorContext.mockResolvedValue({ actor, email: actor.verifiedEmail, authTime: Math.floor(Date.now() / 1000) });
    rpc.mockResolvedValue({ data: null, error: { message: "operator_owner_invitation_operator_required" } });
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(issued()).toHaveLength(0);
  });
});

describe("owner invitation mutations", () => {
  it("requires same origin and rejects browser approval booleans or email flags", async () => {
    expect((await POST(request(undefined, "https://attacker.example"), ctx)).status).toBe(403);
    for (const body of [null, {}, { action: "invite", jacobApproved: true }, { action: "invite", sendEmail: true },
      { action: "invite", recipientEmail: "bad" }, { action: "invite", approvalId: "bad" },
      { action: "revoke", invitationId: "bad" }]) {
      expect((await POST(request(body), ctx)).status).toBe(400);
    }
    expect(issued()).toHaveLength(0);
  });

  it("records a fresh, same-operator approval for the trusted business owner before creating a link", async () => {
    const response = await POST(request(), ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).delivery).toEqual({ status: "not_sent", reason: "email_not_requested" });
    expect(mocks.approval).toHaveBeenCalledWith(actor, WORKSPACE,
      { kind: "owner_invitation.issue", recipientEmail: "owner@example.test", sendEmail: false }, { source: "web" });
    expect(issued()[0]![1]).toMatchObject({ p_operator_user_id: OPERATOR, p_workspace_id: WORKSPACE,
      p_recipient_email: "owner@example.test", p_approval_id: APPROVAL, p_send_email: false, p_audit_context: { source: "web" } });
  });

  it("requires a sign-in within ten minutes for the trusted-recipient path", async () => {
    mocks.operatorContext.mockResolvedValue({ actor, email: actor.verifiedEmail, authTime: Math.floor(Date.now() / 1000) - 601 });
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(mocks.approval).not.toHaveBeenCalled();
    expect(issued()).toHaveLength(0);
  });

  it("uses the second operator's recorded ID for a non-trusted address", async () => {
    const fallback = { email: "owner@example.test", name: null, from: "tenant_fallback", source: null, verified: false };
    rpc.mockImplementation(async (name, args) => {
      if (name === "read_operator_owner_invitation_state") return { data: state({ recipient: fallback }), error: null };
      if (name === "create_operator_owner_invitation_approved") return { data: {
        invitationId: INVITATION, workspaceId: WORKSPACE, workspaceName: "Test Business", recipientEmail: args.p_recipient_email,
        role: "owner", status: "pending", expiresAt: args.p_expires_at, createdAt: "2026-10-01", createdBy: OPERATOR, tenants: state().tenants,
      }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });
    expect((await POST(request(), ctx)).status).toBe(409);
    expect(mocks.approval).not.toHaveBeenCalled();
    expect((await POST(request({ action: "invite", approvalId: APPROVAL }), ctx)).status).toBe(200);
    expect(issued()[0]![1]).toMatchObject({ p_operator_user_id: OPERATOR, p_approval_id: APPROVAL });
  });

  it("revokes only an invitation in the scoped pending set using the session user ID", async () => {
    rpc.mockImplementation(async (name) => name === "read_operator_owner_invitation_state"
      ? { data: state({ pending: [{ invitationId: INVITATION, recipientEmail: "owner@example.test", createdAt: "2026-10-01", expiresAt: "2026-10-15" }] }), error: null }
      : { data: "revoked", error: null });
    expect(await (await POST(request({ action: "revoke", invitationId: INVITATION }), ctx)).json()).toEqual({ status: "revoked" });
    expect(rpc).toHaveBeenCalledWith("revoke_operator_owner_invitation_audited", {
      p_operator_user_id: OPERATOR, p_invitation_id: INVITATION, p_audit_context: { source: "web" },
    });
  });
});

it("preserves forbidden/unavailable GET envelopes and never reads invitation PII without admission", async () => {
  admission.mockRejectedValueOnce(new WorkspaceAccessError()); expect((await GET(new Request("https://app.test/test"), ctx)).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  admission.mockRejectedValueOnce(new Error("audit unavailable")); expect((await GET(new Request("https://app.test/test"), ctx)).status).toBe(503); expect(rpc).not.toHaveBeenCalled(); expect(mocks.workspace).not.toHaveBeenCalled();
});
