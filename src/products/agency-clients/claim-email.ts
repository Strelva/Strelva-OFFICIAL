/** Explicit transactional owner-link delivery. Copying a link never sends mail.
 * This invites ownership; it cannot exercise an unclaimed business’s sending
 * mandate. The exact agency/seat/email verification is checked in SQL instead. */
import { createHash } from "node:crypto";
import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/platform/infra/email/send";
import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { OwnerClaim, OwnerClaimDelivery } from "./contracts";

export function agencyClaimEmailReleased(): boolean {
  return process.env.STRELVA_WORKSPACE_RELEASE === "1" && process.env.STRELVA_AGENCY_OWNER_CLAIM_EMAIL_RELEASE === "1";
}
export interface ClaimEmailDeps {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  send(input: SendEmailInput): Promise<SendEmailResult>;
  released(): boolean;
  /** The agency's display name when the caller has it. Without it the email says "Your agency". */
  agencyName?: string;
}

/**
 * The claim email's words (XA · C1 in an inbox): what is ready, who set it up,
 * that the site keeps running, and that the link alone grants nothing. One
 * button. Template only while client email stays off during the rollout.
 */
export function claimEmailOptions(claim: Pick<OwnerClaim, "workspaceName">, claimUrl: string, agencyName?: string) {
  const agency = agencyName?.trim() || "Your agency";
  return {
    preheader: `${agency} set up ${claim.workspaceName} on Strelva. Claim it to own the workspace and its data.`,
    heading: `${claim.workspaceName} is ready for its owner.`,
    paragraphs: [
      `${agency} set up ${claim.workspaceName} on Strelva for you. Review what they found and prepared, confirm your details, then choose what ${agencyName?.trim() || "your agency"} can do.`,
      "Your site keeps running whether or not you claim it. Claiming does not publish your website or accept a price.",
    ],
    button: { label: `Claim ${claim.workspaceName}`, url: claimUrl },
    footerNote: "Sign in with the email this was sent to. The link alone grants nothing and shows nothing private.",
  };
}

/** The persisted reservation prevents a lost response from becoming a fresh send.
 * No raw token is saved; the provider gets one idempotency key per claim. */
export async function emailOwnerClaim(actor: WorkspaceActor, agencyWorkspaceId: string, claim: OwnerClaim,
  deps: ClaimEmailDeps): Promise<OwnerClaimDelivery> {
  if (!deps.released()) return claim.delivery;
  const held: OwnerClaimDelivery = { ...claim.delivery, status: "not_sent", reason: "permission_or_email_gate" };
  const args = { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase(),
    p_agency_workspace_id: agencyWorkspaceId, p_claim_id: claim.claimId,
    p_token_hash: createHash("sha256").update(claim.claimPath.split("/").at(-1) ?? "").digest("hex") };
  let reserved;
  try { reserved = await deps.rpc("prepare_agency_owner_claim_email", args); } catch { return held; }
  if (reserved.error || reserved.data !== true) return held;
  let delivery: OwnerClaimDelivery;
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || CONTROL_PLANE_URL);
    if (origin.protocol !== "https:") throw new Error("Secure app origin required");
    const result = await deps.send({ audience: "client", authorship: "platform", workspaceId: claim.customerWorkspaceId,
      fromAddress: "hello@updates.strelva.com", to: claim.recipientEmail,
      subject: `Claim ${claim.workspaceName} on Strelva`, idempotencyKey: `agency-owner-claim:${claim.claimId}`,
      options: claimEmailOptions(claim, new URL(claim.claimPath, origin.origin).toString(), deps.agencyName) });
    delivery = result.status === "accepted"
      ? { ...claim.delivery, status: "accepted", reason: "provider_accepted", providerMessageId: result.providerMessageId, acceptedAt: result.acceptedAt }
      : { ...held, reason: "email_suppressed" };
  } catch { delivery = { ...claim.delivery, status: "unknown", reason: "delivery_unconfirmed" }; }
  // Acceptance remains acceptance if its receipt cannot be read back. This path
  // never retries the provider after a successful or uncertain send.
  try { await deps.rpc("record_agency_owner_claim_email", { ...args, p_delivery: delivery }); } catch { /* Reservation stays held. */ }
  return delivery;
}
export const claimEmailTransport = sendEmailWithReceipt;
