/**
 * Who is saving a tenant's content autonomy or reply mode, for the
 * decision_policies write (src/platform/needs-you/tenant-settings.ts).
 *
 * A tenant member saves the owner's layer; a Strelva operator (super admin)
 * saves Strelva's layer, because an operator never sets the owner's choice.
 * Only a verified Supabase user can write; anyone else (including dev access
 * bypass) gets null and the setting stays in Redis alone, as before. The
 * caller has already checked tenant permission; the SQL checks again.
 */
import { getSessionUser } from "./db/server-client";
import { getTenantRole } from "./auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantPolicyWriter {
  actor: { userId: string; verifiedEmail: string };
  layer: "owner" | "strelva";
}

export async function tenantPolicyWriter(tenant: string, deps: {
  sessionUser?: typeof getSessionUser;
  tenantRole?: typeof getTenantRole;
} = {}): Promise<TenantPolicyWriter | null> {
  const user = await (deps.sessionUser ?? getSessionUser)().catch(() => null);
  if (!user?.id || !UUID.test(user.id) || !user.email || !user.email_confirmed_at) return null;
  const role = await (deps.tenantRole ?? getTenantRole)(tenant).catch(() => null);
  if (!role) return null;
  return {
    actor: { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() },
    layer: role === "super_admin" ? "strelva" : "owner",
  };
}

/** The operator console's writer: always Strelva's layer. */
export async function operatorPolicyWriter(deps: { sessionUser?: typeof getSessionUser } = {}): Promise<TenantPolicyWriter | null> {
  const user = await (deps.sessionUser ?? getSessionUser)().catch(() => null);
  if (!user?.id || !UUID.test(user.id) || !user.email || !user.email_confirmed_at) return null;
  return { actor: { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, layer: "strelva" };
}
