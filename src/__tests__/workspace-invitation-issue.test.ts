import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendEmailInput, SendEmailResult } from "@/platform/infra/email/send";

const rpc = vi.hoisted(() => vi.fn());
const inviteBusinessOwner = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Fixture Firm" }, error: null }) }) }) }) }) }));
vi.mock("@/platform/workspaces/business-ownership", async importOriginal => ({ ...(await importOriginal<typeof import("@/platform/workspaces/business-ownership")>()), inviteBusinessOwner }));

const WS = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.test" };
const row = { id: "11111111-1111-4111-8111-111111111111", workspace_id: WS, recipient_email: "person@example.test", role: "admin", status: "pending",
  expires_at: "2099-01-01T00:00:00.000Z", created_at: "2026-10-01T00:00:00.000Z" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.STRELVA_INVITATION_EMAIL_RELEASE;
  rpc.mockResolvedValue({ data: [row], error: null });
});

describe("issueWorkspaceInvitation", () => {
  it("a member invitation calls the create RPC and returns the link with honest delivery", async () => {
    const { issueWorkspaceInvitation } = await import("@/platform/workspaces/invitations");
    const issued = await issueWorkspaceInvitation({ workspaceId: WS, recipientEmail: "Person@Example.test", role: "admin", issuer: { kind: "member", actor } });
    expect(rpc).toHaveBeenCalledWith("create_workspace_invitation", expect.objectContaining({ p_workspace_id: WS, p_recipient_email: "person@example.test", p_role: "admin" }));
    expect(issued.invitation).toMatchObject({ id: row.id, role: "admin", status: "pending" });
    expect(issued.acceptUrl).toMatch(/\/workspace\/invitations\/accept\/[A-Za-z0-9_-]{43}$/);
    expect(issued.delivery).toEqual({ status: "not_sent", reason: "release_off" });
  });

  it("refuses an operator inviting anyone but the owner", async () => {
    const { issueWorkspaceInvitation } = await import("@/platform/workspaces/invitations");
    await expect(issueWorkspaceInvitation({ workspaceId: WS, recipientEmail: "x@example.test", role: "admin", issuer: { kind: "operator", actor, authTime: null } }))
      .rejects.toThrow("Strelva operators can only invite a business owner. The owner adds everyone else from People & access.");
    expect(inviteBusinessOwner).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an operator owner invitation goes through inviteBusinessOwner", async () => {
    inviteBusinessOwner.mockResolvedValue({
      invitation: { invitationId: row.id, workspaceId: WS, workspaceName: "Fixture Firm", recipientEmail: "owner@client.test", role: "owner", status: "pending", expiresAt: row.expires_at, createdAt: row.created_at, createdBy: actor.userId, tenants: [] },
      acceptUrl: "https://app.example.test/workspace/invitations/accept/tok", delivery: { status: "not_sent", reason: "email_not_requested" },
    });
    const { issueWorkspaceInvitation } = await import("@/platform/workspaces/invitations");
    const issued = await issueWorkspaceInvitation({ workspaceId: WS, recipientEmail: "owner@client.test", role: "owner", issuer: { kind: "operator", actor, authTime: 123, auditContext: { source: "web" } } });
    expect(inviteBusinessOwner).toHaveBeenCalledWith(actor, WS, { recipientEmail: "owner@client.test", authTime: 123, auditContext: { source: "web" } });
    expect(issued).toMatchObject({ acceptUrl: "https://app.example.test/workspace/invitations/accept/tok", invitation: { id: row.id, role: "owner" }, delivery: { status: "not_sent", reason: "release_off" } });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("deliverWorkspaceInvitation", () => {
  const invitation = { id: row.id, workspaceId: WS, recipientEmail: "person@example.test", role: "admin" as const };
  const input = { invitation, acceptUrl: "https://app.example.test/workspace/invitations/accept/tok", workspaceName: "Fixture Firm", inviterLabel: "Owner" };
  const accepted: SendEmailResult = { status: "accepted", providerMessageId: "msg_1", acceptedAt: "2026-10-01T00:00:00Z" };

  it("is release_off by default and never calls the transport", async () => {
    const { deliverWorkspaceInvitation } = await import("@/platform/workspaces/invitation-delivery");
    const send = vi.fn();
    expect(await deliverWorkspaceInvitation(input, { send, emailAllowed: () => true })).toEqual({ status: "not_sent", reason: "release_off" });
    expect(send).not.toHaveBeenCalled();
  });

  it("is email_off when released but the client email switches are off", async () => {
    process.env.STRELVA_INVITATION_EMAIL_RELEASE = "1";
    const { deliverWorkspaceInvitation } = await import("@/platform/workspaces/invitation-delivery");
    const send = vi.fn();
    expect(await deliverWorkspaceInvitation(input, { send, emailAllowed: () => false })).toEqual({ status: "not_sent", reason: "email_off" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends only when every gate is true, with one idempotency key per invitation", async () => {
    process.env.STRELVA_INVITATION_EMAIL_RELEASE = "1";
    const { deliverWorkspaceInvitation } = await import("@/platform/workspaces/invitation-delivery");
    const send = vi.fn(async (_input: SendEmailInput) => accepted);
    expect(await deliverWorkspaceInvitation(input, { send, emailAllowed: () => true })).toEqual({ status: "accepted", providerMessageId: "msg_1" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ audience: "client", authorship: "platform", to: "person@example.test", idempotencyKey: `workspace-invitation:${row.id}`, subject: "Join Fixture Firm on Strelva" }));
  });

  it("maps a suppressed send to not_sent and a throw to unknown", async () => {
    process.env.STRELVA_INVITATION_EMAIL_RELEASE = "1";
    const { deliverWorkspaceInvitation } = await import("@/platform/workspaces/invitation-delivery");
    expect(await deliverWorkspaceInvitation(input, { send: async () => ({ status: "suppressed", reason: "paused" }), emailAllowed: () => true })).toEqual({ status: "not_sent", reason: "email_off" });
    expect(await deliverWorkspaceInvitation(input, { send: async () => { throw new Error("boom"); }, emailAllowed: () => true })).toEqual({ status: "unknown", reason: "delivery_unconfirmed" });
  });
});
