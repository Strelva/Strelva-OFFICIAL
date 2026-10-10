import { legacyOwnerLinkAllowed } from "./owner-recipient";
import { isSupabaseConfigured } from "@/platform/infra/db/client";
import { workspacePorts, type TenantReviewApprovalAuthority } from "./workspace-ports";
import { APPROVE_LINK_TTL_MS, verifyLegacyApprovePayload, verifyReviewApproveToken } from "./approve-link";
import type { UnifiedEvent } from "./types";

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
