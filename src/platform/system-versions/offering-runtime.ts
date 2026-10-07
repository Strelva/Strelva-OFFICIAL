/** Offering metadata is its own persisted configuration. It does not publish
 * the application's design or accept work on behalf of a named provider. */
import { z } from "zod";
import { getOfferingDefinition } from "@/platform/offerings/definitions";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { JsonObject } from "./compare";
import { mapVersionsError, type VersionsDb } from "./supabase-store";

const configuration = z.object({ displayName: z.string().trim().min(1).max(80).optional(), instructions: z.string().trim().min(1).max(500).optional() }).strict();
const installation = z.object({ definitionId: z.string(), definitionVersion: z.string(), configuration: z.record(z.string(), z.unknown()) }).passthrough();
export const offeringPackageSchema = z.object({
  kind: z.literal("offering"), definitionId: z.enum(["private_staff_requests", "customer_inquiry_intake", "managed_website_changes"]),
  definitionVersion: z.literal("1.0.0"), configuration: z.object({}).strict(),
}).strict();

/** Both supported metadata fields are local: a client label and an operator
 * note can name people/accounts or contain contact values. Copy neither. */
export function offeringPackageDefinition(raw: unknown): JsonObject {
  const parsed = installation.safeParse(raw);
  if (!parsed.success) throw new WorkspaceStoreError("This offering's reusable configuration could not be verified.");
  const definition = getOfferingDefinition(parsed.data.definitionId, parsed.data.definitionVersion);
  if (!definition || (definition.id === "private_staff_requests" ? !configuration.safeParse(parsed.data.configuration).success : Object.keys(parsed.data.configuration).length > 0)) {
    throw new WorkspaceStoreError("This offering's reusable configuration could not be verified.");
  }
  return offeringPackageSchema.parse({ kind: "offering", definitionId: definition.id, definitionVersion: definition.version, configuration: {} });
}

const choice = z.object({ installationId: z.string().uuid(), revision: z.number().int().positive(), definitionId: z.string(), definitionVersion: z.string(), configuration: z.record(z.string(), z.unknown()) }).strict();
export async function readOfferingPackageForWork(actor: WorkspaceActor, workspaceId: string, workId: string, db: VersionsDb) {
  const { data, error } = await db.rpc("read_offering_package_for_work", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_work_id: workId });
  if (error) mapVersionsError(error, "This offering's reusable definition could not be checked.");
  if (data === null) return null;
  const parsed = choice.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("This offering's reusable definition could not be checked.");
  return { definition: offeringPackageDefinition(parsed.data), fingerprint: `offering:${parsed.data.installationId}:${parsed.data.revision}`, installationId: parsed.data.installationId };
}
