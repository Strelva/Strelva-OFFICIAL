import type { OwnerInvitationsLoad } from "@/platform/owner-entry/operator-invitations";
import type { OwnerInvitationResult } from "@/platform/workspaces/business-ownership";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const OPERATOR = "33333333-3333-4333-8333-333333333333";
const SITE = { tenantId: "preview-business", tenantStableId: "44444444-4444-4444-8444-444444444444", siteName: "Example Law Firm" };

export function ownerInvitationPreviewLoad(name?: string): OwnerInvitationsLoad {
  if (name === "denied" || name === "unconverted" || name === "unavailable") return { kind: name };
  return { kind: "ready", state: {
    workspaceId: WORKSPACE, workspaceName: "Example Law Firm", operatorId: OPERATOR,
    hasOwner: name === "owned", exited: name === "exited",
    recipient: { email: "owner@example.test", name: "Example Owner", from: "record", source: "tenant_import", verified: false }, tenants: [SITE],
    pending: name === "pending" ? [{ invitationId: INVITATION, recipientEmail: "owner@example.test", createdAt: "2026-10-01T12:00:00Z", expiresAt: "2026-10-15T12:00:00Z" }] : [],
  } };
}

/** Synthetic client transport. It never calls fetch, a database or an email provider. */
export function ownerInvitationPreviewRequest(delivery?: string): typeof fetch {
  return async (_input, init) => {
    const command = JSON.parse(String(init?.body));
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (command.action === "revoke") return Response.json({ status: "revoked" });
    if (delivery === "error") return Response.json({ error: "Owner invitation storage is unavailable. Refresh the invitation state before trying again." }, { status: 503 });
    const result: OwnerInvitationResult = {
      invitation: { invitationId: INVITATION, workspaceId: WORKSPACE, workspaceName: "Example Law Firm",
        recipientEmail: command.recipientEmail, role: "owner", status: "pending", createdBy: OPERATOR,
        createdAt: "2026-10-01T12:00:00Z", expiresAt: "2026-10-15T12:00:00Z", tenants: [SITE] },
      acceptUrl: "https://app.example.test/workspace/invitations/accept/preview-token",
      delivery: { status: "not_sent", reason: "email_not_requested" },
    };
    return Response.json({ invitation: result.invitation, delivery: result.delivery,
      ...(result.delivery.status === "not_sent" ? { acceptUrl: result.acceptUrl } : {}) });
  };
}
