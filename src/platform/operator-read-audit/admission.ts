import { z } from "zod";
import { CLIENT_ROLES, getAuthenticatedOperatorContext, roleHasPermission, type ClientRole, type TenantPermission } from "@/platform/infra/auth";
import { getMembershipRole } from "@/platform/infra/db/repositories";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { isDevAccessBypassEnabled } from "@/platform/infra/dev-access";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";

/** Static human support powers; SQL migration 39 owns the matching allowlist. */
export const operatorReadPowers = [
  "admin.clients.read", "admin.accounts.read", "admin.analytics.read", "admin.audit.read",
  "admin.actions.read", "admin.drafts.read", "admin.digests.read", "admin.leads.read",
  "admin.uptime.read", "admin.ops.read", "admin.pay-links.read", "admin.client-leads.read",
  "admin.tenant-controls.read", "admin.component-registry.read", "admin.make-real.read",
  "admin.booking-email.read", "admin.owner-decisions.read",
] as const;
export type OperatorReadPower = typeof operatorReadPowers[number];
const identity = z.object({ userId: z.string().uuid(), verifiedEmail: z.string().trim().toLowerCase().email() });
const power = z.enum(operatorReadPowers);
type AuditDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };

/** Admission commits before the downstream read. It logs an attempted human
 * support access, not returned rows or an atomic transaction over raw stores. */
export async function authorizePlatformOperatorRead(actor: WorkspaceActor, name: OperatorReadPower, database: AuditDb | null = getSupabase()): Promise<void> {
  const parsed = identity.safeParse(actor);
  if (!parsed.success) throw new WorkspaceAccessError();
  const reader = power.parse(name);
  if (!database) throw new Error("Operator read audit is unavailable.");
  const result = await database.rpc("authorize_platform_operator_read", {
    p_user_id: parsed.data.userId, p_verified_email: parsed.data.verifiedEmail, p_reader_name: reader,
  });
  if (result.error?.message?.includes("platform_operator_read_access_denied")) throw new WorkspaceAccessError();
  if (result.error) throw new Error("Operator read audit is unavailable.");
}

/** App entrypoints derive the actor from the verified request session. A label,
 * header, supplied email or system actor cannot select the human being audited. */
export async function authorizeAdminOperatorRead(name: OperatorReadPower): Promise<void> {
  const context = await getAuthenticatedOperatorContext();
  if (!context) throw new WorkspaceAccessError();
  await authorizePlatformOperatorRead(context.actor, name);
}

/** Tenant dashboard views also admit a human's platform membership bypass.
 * A real member/owner/provider reads through their own permission unchanged;
 * public demo and local dev views have no human support actor to attribute. */
export async function authorizeTenantOperatorRead(tenant: string, permissions: readonly TenantPermission[] = []): Promise<void> {
  if (tenant === "demo" || isDevAccessBypassEnabled()) return;
  // Session identity is independent of the operator grant. Losing that grant
  // between the earlier route guard and this admission must never skip audit.
  const user = await getSessionUser();
  if (!user) throw new WorkspaceAccessError();
  const membership = await getMembershipRole(user.id, tenant);
  if (membership) {
    // Match getTenantRole's ordinary-role normalization without its platform
    // bypass: a viewer membership cannot authorize an owner's read permission.
    const role: ClientRole = CLIENT_ROLES.includes(membership as ClientRole) ? membership as ClientRole : "viewer";
    if (permissions.every(permission => roleHasPermission(role, permission))) return;
  }
  if (!user.email_confirmed_at || !user.email) throw new WorkspaceAccessError();
  await authorizePlatformOperatorRead({ userId: user.id, verifiedEmail: user.email }, "admin.clients.read");
}
