import { legacyOwnerLinkAllowed } from "./owner-recipient";
import { isSupabaseConfigured } from "@/platform/infra/db/client";
import { workspacePorts, type TenantReviewApprovalAuthority } from "./workspace-ports";
import { APPROVE_LINK_TTL_MS, verifyLegacyApprovePayload, verifyReviewApproveToken } from "./approve-link";
import type { UnifiedEvent } from "./types";
import { randomUUID } from "node:crypto";
import { verifyReviewApprovePayload } from "./approve-link";

const TIMEOUT_MS = 1500;
/** No cache: every decision reads current authority. Errors and timeouts deny. */
export async function readReviewApprovalAuthority(tenantId: string): Promise<TenantReviewApprovalAuthority | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(async () => (await workspacePorts().businessRecord()).readTenantReviewApprovalAuthority(tenantId)),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); }),
    ]);
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); }
}

export function isManagedReviewApproval(event: Pick<UnifiedEvent, "tenantId" | "type" | "metadata">, tenantId: string): boolean {
  return event.tenantId === tenantId && event.type === "review" && event.metadata?.kind === "review_reply_draft";
}

export async function reviewApprovalTokenAllowed(token: string, tenant: { id: string; ownerEmail?: string | null }, expected?: { eventId: string; action: string }): Promise<boolean> {
  const review = verifyReviewApproveToken(token);
  const legacy = review ? null : verifyLegacyApprovePayload(token);
  const claims = review ?? legacy;
  if (!claims || claims.tenantId !== tenant.id) return false;
  if (expected && (claims.eventId !== expected.eventId || claims.action !== (expected.action === "approved" ? "approve" : expected.action === "dismissed" ? "not-yet" : null))) return false;
  // Local tests/development retain the existing unconverted behavior. Bound
  // workspace review tokens always require the database helper.
  if (!isSupabaseConfigured()) return !review && legacyOwnerLinkAllowed(tenant);
  const authority = await readReviewApprovalAuthority(tenant.id);
  if (!authority || authority.tenantId !== tenant.id) return false;
  if (review) return authority.workspaceId === review.workspaceId && authority.recipient === review.recipient && authority.version === review.authorityVersion;
  if (!authority.legacyAllowed || !legacy) return false;
  return !authority.conversionAt || legacy.exp - APPROVE_LINK_TTL_MS <= Date.parse(authority.conversionAt);
}

/** Commit admits this exact one-shot command. Subsequent owner changes revoke
 * new admissions, while an already-admitted command may finish and reconcile. */
export async function admitReviewApprovalDispatch(token: string, scope: {
  tenantId: string; eventId: string; action: "approved" | "dismissed"; attemptId: string;
  ledger: "legacy" | "listing" | "event"; ledgerId: string; request: Record<string, unknown>;
}): Promise<{ grantId: string; settle(responseStatus: number): Promise<void> }> {
  const review = verifyReviewApprovePayload(token);
  const legacy = review ? null : verifyLegacyApprovePayload(token);
  const claims = review ?? legacy;
  if (!claims || claims.tenantId !== scope.tenantId || claims.eventId !== scope.eventId
    || claims.action !== (scope.action === "approved" ? "approve" : "not-yet") || !isSupabaseConfigured()) {
    throw new Error("review_approval_authority_changed");
  }
  const input = { ...scope, grantId: randomUUID(), tokenKind: review ? "review" : "legacy", tokenExpiresAt: claims.exp,
    tokenIssuedAt: claims.exp - APPROVE_LINK_TTL_MS, workspaceId: review?.workspaceId ?? null,
    recipient: review?.recipient ?? null, authorityVersion: review?.authorityVersion ?? null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const grant = await Promise.race([
      Promise.resolve().then(async () => (await workspacePorts().businessRecord()).admitTenantReviewApprovalDispatch(input)),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); }),
    ]);
    // A lost response is not permission to send or to reuse its grant.
    if (!grant?.admitted || grant.grantId !== input.grantId) throw new Error("review_approval_authority_changed");
    return { grantId: input.grantId, settle: async responseStatus => {
      await (await workspacePorts().businessRecord()).settleTenantReviewDispatchAdmission(input.grantId, scope.ledgerId, scope.request, responseStatus);
    } };
  } finally { if (timer) clearTimeout(timer); }
}
