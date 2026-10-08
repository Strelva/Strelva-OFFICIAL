import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inviteBusinessOwner,
  listProvidedClients,
  ownerInvitationEmail,
  revokeOwnerInvitation,
  setBusinessOwnershipDb,
} from "@/platform/workspaces/business-ownership";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { setOperatorApprovalsDb } from "@/platform/workspaces/operator-approvals";
import { parseOwnershipArgs, runOwnershipCommand, type OwnershipDeps } from "../../scripts/business-ownership-ops";

// Operator-issued owner invitation and the provider list. The SQL rules (one
// owner, both memberships in one transaction, the mark grants nothing) are
// proven in tests/business-ownership-schema.sql. Fictional data only; no mail.

const WS = "11111111-1111-4111-8111-111111111111";
const INVITE = "22222222-2222-4222-8222-222222222222";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const OPERATOR_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR = { userId: OPERATOR_ID, verifiedEmail: "Ops@Strelva.example" };
const state = (over: Record<string, unknown> = {}) => ({
  workspaceId: WS, workspaceName: "Great Lakes Dried Fruit", operatorId: OPERATOR_ID, hasOwner: false, exited: false,
  recipient: { email: "ruth@gldf.example", name: "Ruth", from: "record", source: "tenant_import", verified: false, tenantId: null },
  tenants: [{ tenantId: "gldf", tenantStableId: "44444444-4444-4444-8444-444444444444", siteName: "Great Lakes Dried Fruit" }],
  pending: [], ...over,
});
const created = (args: Record<string, unknown>) => ({
  invitationId: INVITE, workspaceId: WS, workspaceName: "Great Lakes Dried Fruit", recipientEmail: args.p_recipient_email,
  role: "owner", status: "pending", expiresAt: args.p_expires_at, createdAt: "2026-10-06T12:00:00.000Z", createdBy: OPERATOR_ID,
  tenants: state().tenants,
});

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
let rpc: ReturnType<typeof vi.fn<Rpc>>;
let approvalRpc: ReturnType<typeof vi.fn<Rpc>>;
beforeEach(() => {
  rpc = vi.fn<Rpc>(async (name, args) => {
    if (name === "read_operator_owner_invitation_state") return { data: state(), error: null };
    if (name === "create_operator_owner_invitation_approved") return { data: created(args), error: null };
    if (name === "revoke_operator_owner_invitation_audited") return { data: "revoked", error: null };
    return { data: null, error: { message: `unexpected ${name}` } };
  });
  approvalRpc = vi.fn<Rpc>(async (_name, args) => ({ data: {
    approvalId: APPROVAL, workspaceId: args.p_workspace_id, actionKind: args.p_action_kind, target: args.p_target,
    approvedBy: OPERATOR_ID, approvedEmail: "ops@strelva.example", approvedAt: "2026-10-06T12:00:00.000Z", expiresAt: "2026-10-06T12:15:00.000Z",
  }, error: null }));
  setBusinessOwnershipDb({ rpc });
  setOperatorApprovalsDb({ rpc: approvalRpc });
});
afterEach(() => { setBusinessOwnershipDb(null); setOperatorApprovalsDb(null); });

describe("inviteBusinessOwner", () => {
  it("records the trusted owner's approval as the authenticated operator after fresh sign-in", async () => {
    const now = new Date("2026-10-06T12:00:00Z");
    const result = await inviteBusinessOwner(ACTOR, WS, { authTime: now.getTime() / 1000, now: () => now });
    expect(approvalRpc).toHaveBeenCalledWith("create_operator_action_approval", expect.objectContaining({
      p_approver_user_id: OPERATOR_ID, p_workspace_id: WS, p_action_kind: "owner_invitation.issue",
      p_target: { recipientEmail: "ruth@gldf.example", sendEmail: false },
    }));
    const createArgs = rpc.mock.calls.find(([name]) => name === "create_operator_owner_invitation_approved")![1];
    expect(createArgs).toMatchObject({ p_operator_user_id: OPERATOR_ID, p_workspace_id: WS, p_recipient_email: "ruth@gldf.example",
      p_expires_at: "2026-10-20T12:00:00.000Z", p_approval_id: APPROVAL, p_send_email: false, p_audit_context: { source: "web" } });
    const token = result.acceptUrl.split("/").pop()!;
    expect(createArgs.p_token_hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(result.acceptUrl).toMatch(/\/workspace\/invitations\/accept\/[A-Za-z0-9_-]{43}$/);
    expect(result.delivery).toEqual({ status: "not_sent", reason: "email_not_requested" });
  });

  it("rejects a stale session before recording an approval", async () => {
    await expect(inviteBusinessOwner(ACTOR, WS, { authTime: 1, now: () => new Date("2026-10-06T12:00:00Z") })).rejects.toThrow(/last 10 minutes/);
    expect(approvalRpc).not.toHaveBeenCalled();
    expect(rpc.mock.calls.some(([name]) => name === "create_operator_owner_invitation_approved")).toBe(false);
  });

  it("never sends when email isn't requested, and an explicit recipient wins", async () => {
    const result = await inviteBusinessOwner(ACTOR, WS, { authTime: null, approvalId: APPROVAL, recipientEmail: " Owner@Other.example " });
    expect(result.delivery).toEqual({ status: "not_sent", reason: "email_not_requested" });
    const args = rpc.mock.calls.find(([name]) => name === "create_operator_owner_invitation_approved")![1];
    expect(args.p_recipient_email).toBe("owner@other.example");
    expect(args.p_send_email).toBe(false);
  });

  it("refuses a business that already has an owner or has nobody to invite, before writing", async () => {
    rpc.mockImplementation(async () => ({ data: state({ hasOwner: true }), error: null }));
    await expect(inviteBusinessOwner(ACTOR, WS, { authTime: null, approvalId: APPROVAL })).rejects.toBeInstanceOf(WorkspaceConflictError);
    rpc.mockImplementation(async () => ({ data: state({ recipient: null }), error: null }));
    await expect(inviteBusinessOwner(ACTOR, WS, { authTime: null, approvalId: APPROVAL })).rejects.toThrow("No owner address");
    expect(rpc.mock.calls.some(([name]) => name === "create_operator_owner_invitation_approved")).toBe(false);
  });

  it("maps database refusals onto access and conflict errors", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "operator_owner_invitation_operator_required" } }));
    await expect(inviteBusinessOwner(ACTOR, WS, { authTime: null, approvalId: APPROVAL, recipientEmail: "other@example.test" })).rejects.toBeInstanceOf(WorkspaceAccessError);
    rpc.mockImplementation(async (name: string) => name === "read_operator_owner_invitation_state"
      ? { data: state(), error: null } : { data: null, error: { message: "operator_owner_invitation_pending" } });
    await expect(inviteBusinessOwner(ACTOR, WS, { authTime: new Date().getTime() / 1000 })).rejects.toThrow("already waiting");
    rpc.mockImplementation(async (name: string) => name === "revoke_operator_owner_invitation_audited"
      ? { data: "revoked", error: null } : { data: null, error: { message: `unexpected ${name}` } });
    await expect(revokeOwnerInvitation(ACTOR, INVITE)).resolves.toBe("revoked");
  });

  it("the email names Strelva, the business and the expiry, and promises nothing needs a sign-in", () => {
    const options = ownerInvitationEmail({ workspaceName: "Twin Trees", siteNames: ["Twin Trees Camillus", "Twin Trees Fayetteville"], acceptUrl: "https://example.test/accept", expiresAt: "2026-10-20T12:00:00Z", recipientName: "Sam" });
    const text = JSON.stringify(options);
    expect(text).toContain("Twin Trees Camillus, Twin Trees Fayetteville");
    expect(text).toContain("October 20");
    expect(text).toContain("never have to sign in");
    expect(text).not.toMatch(/\b(AI|agent|automation|workflow)\b/);
  });
});

describe("listProvidedClients", () => {
  it("passes the verified actor and parses the list", async () => {
    rpc.mockImplementation(async () => ({ data: [{ customerWorkspaceId: WS, name: "Great Lakes Dried Fruit", role: "admin", source: "tenant_conversion", startedAt: "2026-10-06T12:00:00.000Z" }], error: null }));
    await expect(listProvidedClients({ userId: OPERATOR_ID, verifiedEmail: "Ops@Strelva.example" }, WS)).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("list_provided_clients", { p_user_id: OPERATOR_ID, p_verified_email: "ops@strelva.example", p_agency_workspace_id: WS });
    rpc.mockImplementation(async () => ({ data: null, error: { message: "workspace_provider_access_denied" } }));
    await expect(listProvidedClients({ userId: OPERATOR_ID, verifiedEmail: "ops@strelva.example" }, WS)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("parses an owner-chosen provider reached through a staffed provider seat (batch 7A)", async () => {
    rpc.mockImplementation(async () => ({ data: [{ customerWorkspaceId: WS, name: "Northside client", role: "admin", access: "provider_seat", source: "business_choice", startedAt: "2026-10-09T12:00:00.000Z" }], error: null }));
    await expect(listProvidedClients({ userId: OPERATOR_ID, verifiedEmail: "ops@strelva.example" }, WS))
      .resolves.toEqual([expect.objectContaining({ access: "provider_seat", source: "business_choice" })]);
  });
});

describe("scripts/business-ownership.ts", () => {
  const auditContext = { source: "cli" as const, osUser: "jacob", machine: "laptop" };
  function deps(over: Partial<OwnershipDeps> = {}): OwnershipDeps & { lines: string[] } {
    const lines: string[] = [];
    return {
      lines,
      actor: ACTOR,
      authTime: 1791307200,
      auditContext,
      readLink: vi.fn().mockResolvedValue({ tenantId: "gldf", tenantStableId: "44444444-4444-4444-8444-444444444444", siteName: "GLDF", link: { workspaceId: WS, linkedBy: OPERATOR_ID, linkedAt: "x", receipt: {} } }),
      readState: vi.fn().mockResolvedValue(state()),
      invite: vi.fn().mockResolvedValue({ invitation: created({ p_recipient_email: "ruth@gldf.example", p_expires_at: "2026-10-20" }), acceptUrl: "https://admin.example/accept/tok", delivery: { status: "not_sent", reason: "email_not_requested" } }),
      revoke: vi.fn(),
      designate: vi.fn(),
      log: (line) => lines.push(line),
      ...over,
    };
  }
  const local = "http://127.0.0.1:54321";

  it("a dry run reads and writes nothing", async () => {
    const d = deps();
    await runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf"]), databaseUrl: "https://prod.supabase.co" }, d);
    expect(d.invite).not.toHaveBeenCalled();
    expect(d.lines.join("\n")).toContain("ruth@gldf.example");
    expect(d.lines.at(-1)).toBe("Dry run: nothing was written and no email was sent.");
  });

  it("refuses to write to a non-local database without Jacob's yes", async () => {
    const d = deps();
    await expect(runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--apply"]), databaseUrl: "https://prod.supabase.co" }, d)).rejects.toThrow("Jacob's yes");
    await expect(runOwnershipCommand({ ...parseOwnershipArgs(["designate-agency", WS, "--apply"]), databaseUrl: "https://prod.supabase.co" }, d)).rejects.toThrow("Jacob's yes");
    expect(d.invite).not.toHaveBeenCalled();
    expect(d.designate).not.toHaveBeenCalled();
  });

  it("a local apply lets one authenticated operator invite the trusted recipient after fresh sign-in", async () => {
    const d = deps();
    await runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--apply"]), databaseUrl: local }, d);
    expect(d.invite).toHaveBeenCalledWith(ACTOR, WS, { recipientEmail: "ruth@gldf.example", approvalId: undefined, authTime: d.authTime, auditContext });
    expect(d.lines.join("\n")).toContain("Share this accept link by hand");
  });

  it("requires a second operator approval for an address outside the trusted recipient", async () => {
    const fallback = { email: "ruth@gldf.example", name: null, from: "tenant_fallback", source: null, verified: false };
    const d = deps({ readState: vi.fn().mockResolvedValue(state({ recipient: fallback })) });
    await expect(runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--apply"]), databaseUrl: local }, d)).rejects.toThrow(/different active operator/);
    expect(d.invite).not.toHaveBeenCalled();
    const approvalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", `--approval-id=${approvalId}`, "--apply"]), databaseUrl: local }, d);
    expect(d.invite).toHaveBeenCalledWith(ACTOR, WS, { recipientEmail: "ruth@gldf.example", approvalId, authTime: d.authTime, auditContext });
  });

  it("an unconverted site or an existing owner stops before any write", async () => {
    const unlinked = deps({ readLink: vi.fn().mockResolvedValue({ tenantId: "x", tenantStableId: WS, siteName: "X", link: null }) });
    await expect(runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "x", "--apply"]), databaseUrl: local }, unlinked)).rejects.toThrow("not converted");
    const owned = deps({ readState: vi.fn().mockResolvedValue(state({ hasOwner: true })) });
    await runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--apply"]), databaseUrl: local }, owned);
    expect(owned.invite).not.toHaveBeenCalled();
  });

  it("rejects a typed operator identity and unknown flags", () => {
    expect(() => parseOwnershipArgs(["invite-owner", "gldf", "--operator-email=a@b.c"])).toThrow("Unknown flag");
    expect(() => parseOwnershipArgs(["invite-owner", "gldf", "--send"])).toThrow("Unknown flag");
    expect(() => parseOwnershipArgs(["designate-agency", WS, "--recipient=x@y.z"])).toThrow("invite-owner only");
  });
});
