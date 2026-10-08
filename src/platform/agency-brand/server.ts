import { createHash } from "node:crypto";
import { getSupabase } from "@/platform/infra/db/client";
import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
import { readImageDimensions, sniffImageType } from "@/platform/infra/image-signature";
import { releaseWorkspaceForTenant } from "@/platform/release-flags/store";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { agencyNameSchema, brandInputSchema, STRELVA_BRAND, type AgencyBrandInput, type OwnerBrand } from "@/platform/infra/agency-brand";

export class AgencyBrandReplyToError extends Error {}

export function validateBrand(raw: unknown): AgencyBrandInput {
  const brand = brandInputSchema.parse(raw);
  if (brand.logo) {
    const bytes = Buffer.from(brand.logo.data, "base64");
    const size = readImageDimensions(bytes);
    if (!bytes.length || bytes.length > 262144 || bytes.toString("base64") !== brand.logo.data || sniffImageType(bytes) !== brand.logo.type || !size || size.width > 2048 || size.height > 2048) {
      throw new Error("Use a PNG, JPEG or WebP logo up to 256 KiB and 2048 pixels per side.");
    }
  }
  return brand;
}
export async function brandRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await (db as unknown as { rpc(n: string, a: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> }).rpc(name, args);
  if (error) {
    if (error.message.includes("agency_brand_reply_to")) throw new AgencyBrandReplyToError("Reply-to must be a verified email of a current agency member.");
    if (error.message.includes("agency_brand_access")) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("Agency branding is unavailable.");
  }
  return data;
}
export function logoDigest(logo: NonNullable<AgencyBrandInput["logo"]>) { return createHash("sha256").update(Buffer.from(logo.data, "base64")).digest("hex"); }
export function presentBrand(raw: unknown): OwnerBrand {
  if (!raw || typeof raw !== "object") return STRELVA_BRAND;
  const row = raw as { agencyId: string; name: string; brand: unknown; replyTo?: string | null };
  const parsed = row.brand ? validateBrand(row.brand) : null;
  return { agencyId: row.agencyId, name: parsed?.displayName ?? row.name,
    logoUrl: parsed?.logo ? `${CONTROL_PLANE_URL}/api/agency-brand/logo/${row.agencyId}/${logoDigest(parsed.logo)}` : null,
    accentColor: parsed?.accentColor ?? STRELVA_BRAND.accentColor, replyTo: row.replyTo ?? null, credit: "runs_on_strelva" };
}
/** Service read of public presentation only. Callers authorize workspace data separately. */
export async function resolveOwnerBrand(workspaceId: string): Promise<OwnerBrand> {
  try { return presentBrand(await brandRpc("resolve_owner_brand", { p_workspace_id: workspaceId })); }
  catch { console.warn("[agency-brand] owner lookup failed; using Strelva."); return STRELVA_BRAND; }
}
export async function resolveTenantBrand(tenantId: string): Promise<OwnerBrand> {
  try {
    if (!getSupabase()) return STRELVA_BRAND;
    const workspaceId = await releaseWorkspaceForTenant(tenantId);
    return workspaceId ? await resolveOwnerBrand(workspaceId) : STRELVA_BRAND;
  } catch { console.warn("[agency-brand] tenant lookup failed; using Strelva."); return STRELVA_BRAND; }
}
/** Never trust the brand cached in a page/report: re-read effect and member identity at send. */
export async function resolveAgencyEmailIdentity(agencyId: string): Promise<{ name: string; replyTo: string | null } | null> {
  try {
    const raw = await brandRpc("resolve_owner_brand", { p_workspace_id: agencyId }) as { agencyId: string; emailAllowed: boolean } | null;
    if (!raw || raw.agencyId !== agencyId || raw.emailAllowed !== true) return null;
    const brand = presentBrand(raw);
    const name = agencyNameSchema.safeParse(brand.name);
    return name.success ? { name: name.data, replyTo: brand.replyTo } : null;
  } catch { console.warn("[agency-brand] email identity lookup failed; using Strelva."); return null; }
}
export async function manageAgencyBrand(actor: WorkspaceActor, workspaceId: string, brand?: AgencyBrandInput) {
  const data = await brandRpc("manage_agency_brand", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: workspaceId, p_brand: brand ? validateBrand(brand) : null });
  if (!data) throw new WorkspaceStoreError("Agency branding is unavailable.");
  return data as AgencyBrandInput;
}
