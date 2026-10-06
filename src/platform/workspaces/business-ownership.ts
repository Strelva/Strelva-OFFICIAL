/**
 * Who owns and operates a converted business (product-model.md, "Problems that
 * cross specs" item 1; owner-entry.md requirements 8 and 9; agency-and-versions
 * decision 1A).
 *
 *  - An operator-issued owner invitation for a converted business that has no
 *    owner. Accepting it (the existing /workspace/invitations/accept page)
 *    writes the workspace owner membership and an owner row for every linked
 *    tenant in one transaction (accept_workspace_invitation).
 *  - Strelva's agency workspace designation and the provider mark it implies.
 *    The mark grants nothing: the client list is provider rows intersected
 *    with the reader's own membership.
 *
 * Nothing here runs automatically. Every call is an explicit operator action
 * (scripts/business-ownership.ts), and each production invitation is Jacob's
 * yes. The invitation email goes through src/lib/email/send.ts with audience
 * `client` and the business's first tenant, so the per-tenant email switch
 * applies; a suppressed or failed send leaves the invitation pending and
 * returns the accept link for the operator to share by hand.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { OPERATOR_URL } from "@/platform/infra/brand";
import type { SendEmailInput, SendEmailResult } from "@/platform/infra/email/send";
import type { EmailOptions } from "@/platform/infra/email/layout";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "./types";

export const OWNER_INVITATION_LIFETIME_DAYS = 14;

type DbError = { message?: string; code?: string } | null;
export type OwnershipDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

let override: OwnershipDb | null = null;
/** Tests and scripts may supply their own client. */
export function setBusinessOwnershipDb(db: OwnershipDb | null): void {
  override = db;
}
function db(): OwnershipDb {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Business ownership storage is not configured.");
  return client as unknown as OwnershipDb;
}

const ACCESS = [
  "tenant_conversion_operator_required",
  "operator_owner_invitation_operator_required",
  "strelva_agency_workspace_invalid",
  "workspace_provider_access_denied",
  "workspace_invitation_not_found",
];
const CONFLICTS: Record<string, string> = {
  operator_owner_invitation_not_converted: "This business has no converted site, so there is no owner to invite yet.",
  operator_owner_invitation_owner_exists: "This business already has an owner.",
  operator_owner_invitation_pending: "An owner invitation is already waiting. Revoke it before sending another.",
  workspace_invitation_pending: "That address already has a pending invitation to this business.",
  workspace_invitation_command_invalid: "The invitation details are invalid.",
  workspace_exit_future_work_blocked: "This business has left Strelva; no new invitations.",
  strelva_agency_already_designated: "A different workspace is already Strelva's agency workspace.",
};

function fail(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (ACCESS.some((code) => detail.includes(code))) throw new WorkspaceAccessError();
  for (const [code, message] of Object.entries(CONFLICTS)) {
    if (detail.includes(code)) throw new WorkspaceConflictError(message);
  }
  throw new WorkspaceStoreError(fallback);
}

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) fail(error, fallback);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
  return parsed.data;
}

const operatorEmail = z.string().trim().toLowerCase().email();
const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().email().max(254);
const linkedTenant = z.object({ tenantId: z.string(), tenantStableId: uuid, siteName: z.string() });

export const ownerInvitationStateSchema = z.object({
  workspaceId: uuid,
  workspaceName: z.string(),
  operatorId: uuid,
  hasOwner: z.boolean(),
  exited: z.boolean(),
  recipient: z.object({ email: z.string(), name: z.string().nullable(), from: z.enum(["record", "tenant_fallback"]) }).passthrough().nullable(),
  tenants: z.array(linkedTenant),
  pending: z.array(z.object({ invitationId: uuid, recipientEmail: z.string(), expiresAt: z.string(), createdAt: z.string() })),
});
export type OwnerInvitationState = z.infer<typeof ownerInvitationStateSchema>;

const createdSchema = z.object({
  invitationId: uuid,
  workspaceId: uuid,
  workspaceName: z.string(),
  recipientEmail: z.string(),
  role: z.literal("owner"),
  status: z.literal("pending"),
  expiresAt: z.string(),
  createdAt: z.string(),
  createdBy: uuid,
  tenants: z.array(linkedTenant),
});
export type OperatorOwnerInvitation = z.infer<typeof createdSchema>;

export async function readOwnerInvitationState(operator: string, workspaceId: string): Promise<OwnerInvitationState> {
  return call("read_operator_owner_invitation_state", { p_operator_email: operatorEmail.parse(operator), p_workspace_id: uuid.parse(workspaceId) },
    ownerInvitationStateSchema, "The business's ownership could not be read.");
}

export type OwnerInvitationDelivery =
  | { status: "sent"; providerMessageId: string }
  | { status: "not_sent"; reason: string };

export interface OwnerInvitationResult {
  invitation: OperatorOwnerInvitation;
  /** Holds the one-time token. Show it only when the email did not go out. */
  acceptUrl: string;
  delivery: OwnerInvitationDelivery;
}

export function ownerInvitationAcceptUrl(token: string): string {
  return new URL(`/workspace/invitations/accept/${token}`, OPERATOR_URL).toString();
}

/** The invitation email. Strelva is the only name that acts; no tooling words. */
export function ownerInvitationEmail(input: { workspaceName: string; siteNames: string[]; acceptUrl: string; expiresAt: string; recipientName?: string | null }): EmailOptions {
  const sites = input.siteNames.length ? input.siteNames.join(", ") : input.workspaceName;
  const expires = new Date(input.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return {
    preheader: `Strelva set up ${input.workspaceName} for you. Accept to become its owner.`,
    heading: `${input.workspaceName} is ready for you`,
    paragraphs: [
      `${input.recipientName ? `Hi ${input.recipientName}, ` : ""}Strelva keeps running ${sites} for you, and now there is one place where you can see it: your website, the people who reach out, and anything that needs your decision.`,
      "Accept this invitation to become the owner. Owners decide, publish, pay and can take everything with them at any time. You never have to sign in for your site to keep working.",
      `This invitation works until ${expires}. If you weren't expecting it, you can ignore it.`,
    ],
    button: { label: "Accept and open", url: input.acceptUrl },
    footerNote: `Sent by Strelva for ${input.workspaceName}`,
  };
}

export interface InviteOwnerOptions {
  /** Defaults to the business record's owner recipient (resolve_business_owner_recipient). */
  recipientEmail?: string;
  /** False creates the invitation and returns the link without sending (local rehearsal). */
  sendEmail: boolean;
  /** Injected transport; defaults to src/lib/email/send.ts. */
  send?: (input: SendEmailInput) => Promise<SendEmailResult>;
  now?: () => Date;
}

/** Issue the one owner invitation for a converted business, then email it. */
export async function inviteBusinessOwner(operator: string, workspaceId: string, options: InviteOwnerOptions): Promise<OwnerInvitationResult> {
  const state = await readOwnerInvitationState(operator, workspaceId);
  if (state.hasOwner) throw new WorkspaceConflictError(CONFLICTS.operator_owner_invitation_owner_exists);
  const recipient = email.safeParse(options.recipientEmail ?? state.recipient?.email ?? "");
  if (!recipient.success) throw new WorkspaceConflictError("No owner address is on record. Pass the owner's email address.");
  const token = randomBytes(32).toString("base64url");
  const now = options.now?.() ?? new Date();
  const invitation = await call("create_operator_owner_invitation", {
    p_operator_email: operatorEmail.parse(operator),
    p_workspace_id: state.workspaceId,
    p_recipient_email: recipient.data,
    p_token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
    p_expires_at: new Date(now.getTime() + OWNER_INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  }, createdSchema, "The owner invitation could not be created.");
  const acceptUrl = ownerInvitationAcceptUrl(token);
  if (!options.sendEmail) return { invitation, acceptUrl, delivery: { status: "not_sent", reason: "email_not_requested" } };
  const primaryTenant = invitation.tenants[0]?.tenantId;
  const recipientName = state.recipient && state.recipient.email === recipient.data ? state.recipient.name : null;
  try {
    const send = options.send ?? (await import("@/platform/infra/email/send")).sendEmailWithReceipt;
    const result = await send({
      audience: "client",
      ...(primaryTenant ? { tenantId: primaryTenant } : {}),
      to: invitation.recipientEmail,
      subject: `Strelva set up ${invitation.workspaceName} for you`,
      idempotencyKey: `owner-invitation:${invitation.invitationId}`,
      options: ownerInvitationEmail({
        workspaceName: invitation.workspaceName,
        siteNames: invitation.tenants.map((tenant) => tenant.siteName),
        acceptUrl,
        expiresAt: invitation.expiresAt,
        recipientName,
      }),
    });
    return result.status === "accepted"
      ? { invitation, acceptUrl, delivery: { status: "sent", providerMessageId: result.providerMessageId } }
      : { invitation, acceptUrl, delivery: { status: "not_sent", reason: result.reason } };
  } catch (error) {
    return { invitation, acceptUrl, delivery: { status: "not_sent", reason: error instanceof Error ? error.message : "send_failed" } };
  }
}

export async function revokeOwnerInvitation(operator: string, invitationId: string): Promise<"revoked" | "expired" | "accepted"> {
  return call("revoke_operator_owner_invitation", { p_operator_email: operatorEmail.parse(operator), p_invitation_id: uuid.parse(invitationId) },
    z.enum(["revoked", "expired", "accepted"]), "The owner invitation could not be revoked.");
}

const designationSchema = z.object({ workspaceId: uuid, designatedBy: uuid, designatedAt: z.string(), marked: z.number().int().min(0), replayed: z.boolean() });
export type StrelvaAgencyDesignation = z.infer<typeof designationSchema>;

/** Name Strelva's agency workspace once, marking every converted business as operated by it. */
export async function designateStrelvaAgencyWorkspace(operator: string, agencyWorkspaceId: string): Promise<StrelvaAgencyDesignation> {
  return call("designate_strelva_agency_workspace", { p_operator_email: operatorEmail.parse(operator), p_workspace_id: uuid.parse(agencyWorkspaceId) },
    designationSchema, "Strelva's agency workspace could not be designated.");
}

export const providedClientSchema = z.object({
  customerWorkspaceId: uuid,
  name: z.string(),
  role: z.enum(["owner", "admin", "member"]),
  source: z.enum(["tenant_conversion", "operator"]),
  startedAt: z.string(),
});
export type ProvidedClient = z.infer<typeof providedClientSchema>;

/** Businesses this agency operates that the actor can already open. Grants nothing. */
export async function listProvidedClients(actor: WorkspaceActor, agencyWorkspaceId: string): Promise<ProvidedClient[]> {
  return call("list_provided_clients", {
    p_user_id: uuid.parse(actor.userId),
    p_verified_email: email.parse(actor.verifiedEmail),
    p_agency_workspace_id: uuid.parse(agencyWorkspaceId),
  }, z.array(providedClientSchema), "Operated businesses could not be loaded.");
}
