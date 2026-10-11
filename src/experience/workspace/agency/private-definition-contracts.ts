import { z } from "zod";
import { applicationSpecSchema } from "@/products/applications/contracts";
import type { JsonObject } from "@/platform/system-versions";

export function privateApplicationDefinition(raw: unknown): JsonObject {
  const shape = z.object({ kind: z.literal("internal_app"), title: z.string(), fields: z.array(z.unknown()), components: z.array(z.unknown()) }).strict().parse(raw);
  const { kind: _kind, ...rawSpec } = shape;
  const { maintenanceOwner: _owner, ...spec } = applicationSpecSchema.parse({ ...rawSpec, maintenanceOwner: "definition-validation" });
  return { kind: "internal_app", ...spec } as JsonObject;
}
