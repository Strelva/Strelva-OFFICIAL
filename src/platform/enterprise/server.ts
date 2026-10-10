import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { unitCommandSchema, unitScopeSchema, unitsViewSchema, unitVersionChoicesSchema, type UnitCommand } from "./contracts";
export type EnterpriseDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export function enterpriseDb(): EnterpriseDb {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Unit storage is unavailable.");
  return db as unknown as EnterpriseDb;
}
export function enterpriseActor(actor: WorkspaceActor) {
  return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().trim().toLowerCase().email().parse(actor.verifiedEmail) };
}
export async function enterpriseCall(db: EnterpriseDb, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (/enterprise_denied|access_review_denied|business_record_access_denied|system_not_found/.test(error.message ?? "")) throw new WorkspaceAccessError();
    if (/enterprise_stale/.test(error.message ?? "")) throw new WorkspaceConflictError("This Unit changed. Reload before trying again.");
    if (/enterprise_(cycle|children|identity|version|parent|archived)|workspace_exit_future_work_blocked/.test(error.message ?? "")) throw new WorkspaceConflictError("This change conflicts with the current Unit hierarchy or Version ownership.");
    throw new WorkspaceStoreError("The Unit change could not be confirmed.");
  }
  return data;
}
export async function readUnits(actor: WorkspaceActor, organizationId: string, db = enterpriseDb()) {
  const scope = unitScopeSchema.parse({ organizationId });
  const value = unitsViewSchema.safeParse(await enterpriseCall(db, "read_enterprise_units", { ...enterpriseActor(actor), p_organization_id: scope.organizationId }));
  if (!value.success || value.data.organizationId !== scope.organizationId || value.data.units.some(unit => unit.organizationId !== scope.organizationId) || new Set(value.data.units.map(unit => unit.id)).size !== value.data.units.length) throw new WorkspaceStoreError("The Unit response was malformed.");
  return value.data;
}
export async function changeUnit(actor: WorkspaceActor, raw: UnitCommand, db = enterpriseDb()) {
  const input = unitCommandSchema.parse(raw);
  const result = z.object({ ok: z.literal(true), id: z.string().uuid(), revision: z.number().int().positive() }).strict().safeParse(await enterpriseCall(db, "change_enterprise_unit", { ...enterpriseActor(actor), p_input: input }));
  if (!result.success || result.data.id !== input.id || result.data.revision !== input.expectedRevision + 1) throw new WorkspaceStoreError("The Unit change response was malformed.");
  return result.data;
}

export async function readUnitVersionChoices(actor: WorkspaceActor, organizationId: string, unitId: string, db = enterpriseDb()) {
  const unit = (await readUnits(actor, organizationId, db)).units.find(item => item.id === z.string().uuid().parse(unitId));
  if (!unit) throw new WorkspaceAccessError();
  const result = unitVersionChoicesSchema.safeParse(await enterpriseCall(db, "read_enterprise_unit_versions", { ...enterpriseActor(actor), p_organization_id: organizationId, p_unit_id: unit.id }));
  if (!result.success || result.data.unitId !== unit.id || result.data.businessId !== unit.businessId) throw new WorkspaceStoreError("The business Version choices could not be confirmed.");
  return result.data;
}
