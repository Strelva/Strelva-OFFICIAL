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
import { parseOwnershipArgs, runOwnershipCommand, type OwnershipDeps } from "../../scripts/business-ownership-ops";

// Operator-issued owner invitation and the provider list. The SQL rules (one
// owner, both memberships in one transaction, the mark grants nothing) are
// proven in tests/business-ownership-schema.sql. Fictional data only; no mail.

const WS = "11111111-1111-4111-8111-111111111111";
const INVITE = "22222222-2222-4222-8222-222222222222";
const OPERATOR_ID = "33333333-3333-4333-8333-333333333333";
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
beforeEach(() => {
  rpc = vi.fn<Rpc>(async (name, args) => {
    if (name === "read_operator_owner_invitation_state") return { data: state(), error: null };
    if (name === "create_operator_owner_invitation") return { data: created(args), error: null };
    return { data: null, error: { message: `unexpected ${name}` } };
  });
  setBusinessOwnershipDb({ rpc });
});
afterEach(() => setBusinessOwnershipDb(null));

describe("inviteBusinessOwner", () => {
  it("invites the record's owner contact for 14 days and sends through the tenant-aware client transport", async () => {
    const send = vi.fn().mockResolvedValue({ status: "accepted", providerMessageId: "msg_1", acceptedAt: "now" });
    const now = new Date("2026-10-06T12:00:00Z");
    const result = await inviteBusinessOwner("Ops@Strelva.example", WS, { sendEmail: true, send, now: () => now });
    const createArgs = rpc.mock.calls.find(([name]) => name === "create_operator_owner_invitation")![1];
    expect(createArgs).toMatchObject({ p_operator_email: "ops@strelva.example", p_workspace_id: WS, p_recipient_email: "ruth@gldf.example",
      p_expires_at: "2026-10-20T12:00:00.000Z" });
    const token = result.acceptUrl.split("/").pop()!;
    expect(createArgs.p_token_hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(result.acceptUrl).toMatch(/\/workspace\/invitations\/accept\/[A-Za-z0-9_-]{43}$/);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({ audience: "client", tenantId: "gldf", to: "ruth@gldf.example",
      idempotencyKey: `owner-invitation:${INVITE}`, subject: "Strelva set up Great Lakes Dried Fruit for you" });
    expect(send.mock.calls[0]![0].options.button.url).toBe(result.acceptUrl);
    expect(result.delivery).toEqual({ status: "sent", providerMessageId: "msg_1" });
  });

  it("keeps the invitation and hands back the link when email is suppressed or fails", async () => {
    const suppressed = await inviteBusinessOwner("ops@strelva.example", WS, { sendEmail: true, send: vi.fn().mockResolvedValue({ status: "suppressed", reason: "email_suppressed_or_unconfigured" }) });
    expect(suppressed.delivery).toEqual({ status: "not_sent", reason: "email_suppressed_or_unconfigured" });
    const failed = await inviteBusinessOwner("ops@strelva.example", WS, { sendEmail: true, send: vi.fn().mockRejectedValue(new Error("provider down")) });
    expect(failed.delivery).toEqual({ status: "not_sent", reason: "provider down" });
    expect(failed.invitation.invitationId).toBe(INVITE);
  });

  it("never sends when email isn't requested, and an explicit recipient wins", async () => {
    const send = vi.fn();
    const result = await inviteBusinessOwner("ops@strelva.example", WS, { sendEmail: false, send, recipientEmail: " Owner@Other.example " });
    expect(send).not.toHaveBeenCalled();
    expect(result.delivery).toEqual({ status: "not_sent", reason: "email_not_requested" });
    expect(rpc.mock.calls.find(([name]) => name === "create_operator_owner_invitation")![1].p_recipient_email).toBe("owner@other.example");
  });

  it("refuses a business that already has an owner or has nobody to invite, before writing", async () => {
    rpc.mockImplementation(async () => ({ data: state({ hasOwner: true }), error: null }));
    await expect(inviteBusinessOwner("ops@strelva.example", WS, { sendEmail: false })).rejects.toBeInstanceOf(WorkspaceConflictError);
    rpc.mockImplementation(async () => ({ data: state({ recipient: null }), error: null }));
    await expect(inviteBusinessOwner("ops@strelva.example", WS, { sendEmail: false })).rejects.toThrow("No owner address");
    expect(rpc.mock.calls.some(([name]) => name === "create_operator_owner_invitation")).toBe(false);
  });

  it("maps database refusals onto access and conflict errors", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "operator_owner_invitation_operator_required" } }));
    await expect(inviteBusinessOwner("ops@strelva.example", WS, { sendEmail: false })).rejects.toBeInstanceOf(WorkspaceAccessError);
    rpc.mockImplementation(async (name: string) => name === "read_operator_owner_invitation_state"
      ? { data: state(), error: null } : { data: null, error: { message: "operator_owner_invitation_pending" } });
    await expect(inviteBusinessOwner("ops@strelva.example", WS, { sendEmail: false })).rejects.toThrow("already waiting");
    rpc.mockImplementation(async () => ({ data: "revoked", error: null }));
    await expect(revokeOwnerInvitation("ops@strelva.example", INVITE)).resolves.toBe("revoked");
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
});

describe("scripts/business-ownership.ts", () => {
  function deps(over: Partial<OwnershipDeps> = {}): OwnershipDeps & { lines: string[] } {
    const lines: string[] = [];
    return {
      lines,
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
    await runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--operator-email=ops@strelva.example"]), databaseUrl: "https://prod.supabase.co" }, d);
    expect(d.invite).not.toHaveBeenCalled();
    expect(d.lines.join("\n")).toContain("ruth@gldf.example");
    expect(d.lines.at(-1)).toBe("Dry run: nothing was written and no email was sent.");
  });

  it("refuses to write to a non-local database without Jacob's yes", async () => {
    const d = deps();
    await expect(runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--operator-email=ops@strelva.example", "--apply"]), databaseUrl: "https://prod.supabase.co" }, d)).rejects.toThrow("Jacob's yes");
    await expect(runOwnershipCommand({ ...parseOwnershipArgs(["designate-agency", WS, "--operator-email=ops@strelva.example", "--apply"]), databaseUrl: "https://prod.supabase.co" }, d)).rejects.toThrow("Jacob's yes");
    expect(d.invite).not.toHaveBeenCalled();
    expect(d.designate).not.toHaveBeenCalled();
  });

  it("a local apply creates the invitation without email; email needs Jacob's yes", async () => {
    const d = deps();
    await runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--operator-email=ops@strelva.example", "--apply"]), databaseUrl: local }, d);
    expect(d.invite).toHaveBeenCalledWith("ops@strelva.example", WS, { recipientEmail: "ruth@gldf.example", sendEmail: false });
    expect(d.lines.join("\n")).toContain("Share this accept link by hand");
    const yes = deps();
    await runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--operator-email=ops@strelva.example", "--apply", "--i-have-jacobs-yes"]), databaseUrl: local }, yes);
    expect(yes.invite).toHaveBeenCalledWith("ops@strelva.example", WS, { recipientEmail: "ruth@gldf.example", sendEmail: true });
  });

  it("an unconverted site or an existing owner stops before any write", async () => {
    const unlinked = deps({ readLink: vi.fn().mockResolvedValue({ tenantId: "x", tenantStableId: WS, siteName: "X", link: null }) });
    await expect(runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "x", "--operator-email=ops@strelva.example", "--apply"]), databaseUrl: local }, unlinked)).rejects.toThrow("not converted");
    const owned = deps({ readState: vi.fn().mockResolvedValue(state({ hasOwner: true })) });
    await runOwnershipCommand({ ...parseOwnershipArgs(["invite-owner", "gldf", "--operator-email=ops@strelva.example", "--apply"]), databaseUrl: local }, owned);
    expect(owned.invite).not.toHaveBeenCalled();
  });

  it("rejects unknown flags and missing operator", () => {
    expect(() => parseOwnershipArgs(["invite-owner", "gldf"])).toThrow("--operator-email");
    expect(() => parseOwnershipArgs(["invite-owner", "gldf", "--operator-email=a@b.c", "--send"])).toThrow("Unknown flag");
    expect(() => parseOwnershipArgs(["designate-agency", WS, "--operator-email=a@b.c", "--recipient=x@y.z"])).toThrow("invite-owner only");
  });
});
