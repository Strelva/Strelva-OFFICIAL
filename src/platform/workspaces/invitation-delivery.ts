/**
 * Delivery of a workspace invitation. The email path is complete but cannot
 * fire by default: it needs STRELVA_INVITATION_EMAIL_RELEASE plus the global
 * client-email switches (EMAIL_SENDING_ENABLED and CUSTOMER_EMAIL_ENABLED),
 * which stay off. When nothing is sent, the caller says so and shows the link.
 */
import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/platform/infra/email/send";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import type { WorkspaceInvitation } from "./invitations";
import { teamInvitationPaperEmail } from "@/platform/infra/email/paper-templates";

export type InvitationDelivery =
  | { status: "not_sent"; reason: "email_off" | "release_off" | "email_not_requested" }
  | { status: "accepted"; providerMessageId: string | null }
  | { status: "unknown"; reason: "delivery_unconfirmed" };

export function invitationEmailReleased(): boolean {
  return process.env.STRELVA_INVITATION_EMAIL_RELEASE === "1";
}

export interface InvitationDeliveryDeps {
  send(input: SendEmailInput): Promise<SendEmailResult>;
  emailAllowed(): boolean;
}

const defaults: InvitationDeliveryDeps = {
  send: sendEmailWithReceipt,
  emailAllowed: () => emailSendingEnabled() && customerEmailEnabled(),
};

export async function deliverWorkspaceInvitation(
  input: {
    invitation: Pick<WorkspaceInvitation, "id" | "workspaceId" | "recipientEmail" | "role">;
    acceptUrl: string;
    /** Read only when an email would actually go out. */
    workspaceName: string | (() => Promise<string>);
    inviterLabel: string;
  },
  deps: InvitationDeliveryDeps = defaults,
): Promise<InvitationDelivery> {
  if (!invitationEmailReleased()) return { status: "not_sent", reason: "release_off" };
  if (!deps.emailAllowed()) return { status: "not_sent", reason: "email_off" };
  try {
    const workspaceName = typeof input.workspaceName === "string" ? input.workspaceName : await input.workspaceName();
    const result = await deps.send({
      audience: "client",
      authorship: "platform",
      workspaceId: input.invitation.workspaceId,
      to: input.invitation.recipientEmail,
      subject: `Join ${workspaceName} on Strelva`,
      idempotencyKey: `workspace-invitation:${input.invitation.id}`,
      options: {
        // XA layout; heading, paragraphs and button stay as the plain fallback.
        paper: teamInvitationPaperEmail({ workspace: workspaceName, inviter: input.inviterLabel, recipient: input.invitation.recipientEmail, owner: input.invitation.role === "owner", accept: { label: "Accept the invitation", url: input.acceptUrl } }),
        heading: `You're invited to ${workspaceName}`,
        paragraphs: [
          `${input.inviterLabel} invited you to join ${workspaceName} on Strelva${input.invitation.role === "owner" ? " as its owner" : ""}. Sign in with this email address to accept.`,
          "If you weren't expecting this, you can ignore it. Nothing changes until you accept.",
        ],
        button: { label: "Accept the invitation", url: input.acceptUrl },
      },
    });
    return result.status === "accepted" ? { status: "accepted", providerMessageId: result.providerMessageId } : { status: "not_sent", reason: "email_off" };
  } catch {
    return { status: "unknown", reason: "delivery_unconfirmed" };
  }
}
