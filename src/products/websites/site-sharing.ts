import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { assertWorkspaceWebsiteAccess, assertWorkspaceMember, getWork, listWorkspaces, createHandoff } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";

const shareSchema = z.object({ version: z.literal(1), workspaceId: z.string().min(1).max(128), workId: z.string().min(1).max(128), revision: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), createdBy: z.string().min(1).max(128), creatorEmail: z.string().email().max(254), recipientEmail: z.string().email().max(254), expiresAt: z.number().int().positive() }).strict();
export type WebsiteShare = z.infer<typeof shareSchema>;
export const websiteShareInputSchema = z.object({ recipientEmail: z.string().email().max(254), expiresInHours: z.number().int().min(1).max(168).default(72) }).strict();
export const WEBSITE_SHARE_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
function key(secret: string) { if (secret.length < 32) throw new WorkspaceConflictError("Private preview signing is not configured."); return secret; }
export function signWebsiteShare(value: WebsiteShare, secret: string): string {
  const payload = Buffer.from(JSON.stringify(shareSchema.parse(value))).toString("base64url");
  return `${payload}.${createHmac("sha256", key(secret)).update(`website-private-preview:v1:${payload}`).digest("base64url")}`;
}
export function verifyWebsiteShare(token: string, secret: string, now = Date.now()): WebsiteShare {
  if (token.length > 4000) throw new WorkspaceAccessError();
  const parts = token.split("."); if (parts.length !== 2) throw new WorkspaceAccessError();
  const [payload, signature] = parts as [string,string];
  const expected = createHmac("sha256", key(secret)).update(`website-private-preview:v1:${payload}`).digest(); const supplied = Buffer.from(signature,"base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) throw new WorkspaceAccessError();
  let value: WebsiteShare;
  try { value = shareSchema.parse(JSON.parse(Buffer.from(payload,"base64url").toString("utf8"))); } catch { throw new WorkspaceAccessError(); }
  if (value.expiresAt <= now || value.expiresAt > now + 7 * 24 * 3600000) throw new WorkspaceAccessError("Private preview has expired");
  return value;
}
export async function assertAgencyWebsite(actor: WorkspaceActor, workId: string) {
  const work = await getWork(actor,workId);
  if (!work || work.productId !== "websites") throw new WorkspaceAccessError();
  // A read-only customer delegation cannot issue shares or transfer customer ownership.
  await assertWorkspaceMember(actor,work.workspaceId);
  const workspace = (await listWorkspaces(actor)).find(value => value.id === work.workspaceId);
  if (workspace?.kind !== "agency") throw new WorkspaceAccessError("Only agency-owned websites can be shared or handed off");
  return work;
}
/** Business-owned drafts retain their existing provider-seat boundary and owner claim.
 * This authorizes a private exact-candidate read, never an ownership transfer. */
export async function readWebsiteSharingContext(actor: WorkspaceActor, workId: string) {
  const work = await getWork(actor, workId);
  if (!work || work.productId !== "websites") throw new WorkspaceAccessError();
  const workspaces = await listWorkspaces(actor);
  const workspace = workspaces.find(value => value.id === work.workspaceId);
  if (workspace?.kind === "agency") {
    await assertAgencyWebsite(actor, workId);
    return { kind: "agency" as const, workspaceId: work.workspaceId, workId };
  }
  if (workspace?.kind !== "customer" || workspace.access !== "provider_seat") throw new WorkspaceAccessError();
  await assertWorkspaceWebsiteAccess(actor, work.workspaceId);
  const agencies = workspaces.filter(value => value.kind === "agency" && value.access === "member");
  const { listAgencyClientAdditions } = await import("@/products/agency-clients/server");
  const clients = (await Promise.all(agencies.map(value => listAgencyClientAdditions(actor, value.id)))).flat()
    .filter(value => value.customerWorkspaceId === work.workspaceId && value.seatActive);
  if (clients.length !== 1) throw new WorkspaceAccessError("The business owner claim could not be confirmed for one current agency.");
  const client = clients[0]!;
  return { kind: "customer" as const, workspaceId: work.workspaceId, workId, agencyWorkspaceId: client.agencyWorkspaceId,
    ownerClaimed: client.ownerClaimed, pendingClaim: client.pendingClaim };
}

export async function assertWebsiteReviewScope(actor: WorkspaceActor, workId: string, recipientEmail?: string) {
  const context = await readWebsiteSharingContext(actor, workId);
  const work = await getWork(actor, workId);
  if (context.kind === "customer") {
    const agency = (await listWorkspaces(actor)).find(value => value.id === context.agencyWorkspaceId && value.kind === "agency" && value.access === "member");
    // A read-only seat cannot expose the client's draft to another account.
    // Only its creator, currently an agency owner/admin, may issue the exact
    // review for the saved pending owner claim. Claimed owners use their own workspace.
    if (!work || work.createdBy !== actor.userId || !agency || !["owner", "admin"].includes(agency.role ?? "")
      || context.ownerClaimed || !context.pendingClaim || Date.parse(context.pendingClaim.expiresAt) <= Date.now()
      || recipientEmail?.trim().toLowerCase() !== context.pendingClaim.recipientEmail.trim().toLowerCase()) throw new WorkspaceAccessError("The private review must match this business's current owner claim.");
  }
  return work;
}

export async function authorizeWebsiteShare(actor: WorkspaceActor, share: WebsiteShare) {
  if (actor.verifiedEmail.trim().toLowerCase() !== share.recipientEmail) throw new WorkspaceAccessError();
  // Recheck the creator's present membership and agency ownership on every read.
  const work = await assertWebsiteReviewScope({ userId: share.createdBy, verifiedEmail: share.creatorEmail },share.workId,share.recipientEmail);
  if (!work || work.workspaceId !== share.workspaceId) throw new WorkspaceAccessError();
  return work;
}
export async function createWebsiteHandoff(actor: WorkspaceActor, workId: string, recipientEmail: string) {
  await assertAgencyWebsite(actor, workId);
  // This creates a proposal only. The existing verified recipient acceptance
  // transaction chooses the destination and any continued read-only agency grant.
  return createHandoff(actor,workId,z.string().email().parse(recipientEmail));
}
