import { z } from "zod";
const uuid = z.string().uuid();
export const unitSchema = z.object({ id: uuid, organizationId: uuid, businessId: uuid, parentId: uuid.nullable(), name: z.string().trim().min(1).max(160), kind: z.enum(["business", "location", "division", "franchise"]), status: z.enum(["active", "archived"]), revision: z.number().int().positive(), versionIds: z.array(uuid) }).strict();
export const unitScopeSchema = z.object({ organizationId: uuid }).strict();
export const unitCommandSchema = z.discriminatedUnion("action", [
  unitScopeSchema.extend({ action: z.literal("put"), id: uuid, businessId: uuid, parentId: uuid.nullable(), name: z.string().trim().min(1).max(160), kind: unitSchema.shape.kind, expectedRevision: z.number().int().nonnegative() }).strict(),
  unitScopeSchema.extend({ action: z.literal("archive"), id: uuid, expectedRevision: z.number().int().positive() }).strict(),
  unitScopeSchema.extend({ action: z.literal("bind_version"), id: uuid, versionId: uuid, expectedRevision: z.number().int().positive() }).strict(),
]);
export const unitsViewSchema = z.object({ organizationId: uuid, units: z.array(unitSchema), inaccessibleUnits: z.number().int().nonnegative() }).strict();
export type Unit = z.infer<typeof unitSchema>;
export type UnitsView = z.infer<typeof unitsViewSchema>;
export type UnitCommand = z.infer<typeof unitCommandSchema>;

export const unitVersionChoicesSchema = z.object({ unitId: uuid, businessId: uuid, versions: z.array(z.object({ id: uuid, name: z.string(), context: z.string(), baselineRevision: z.number().int().positive(), assigned: z.boolean() }).strict()) }).strict();
