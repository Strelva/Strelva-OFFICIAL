import type { OfferingCollection, OfferingConfigurationField, OfferingDefinitionView, OfferingInstallation } from "@/platform/offerings";


export function availabilityLabel(definition: OfferingDefinitionView): string {
  if (definition.installability === "available") return definition.availability === "local" ? "Local release" : "Available to install";
  if (definition.installability === "provider_only") return "Existing clients · provider setup";
  return "Release gated";
}

export function definitionFor(collection: OfferingCollection, installation: OfferingInstallation): OfferingDefinitionView | undefined {
  return collection.definitions.find((definition) => definition.id === installation.definitionId && definition.version === installation.definitionVersion);
}

export function configurationFrom(definition: OfferingDefinitionView, installation?: OfferingInstallation): Record<string, string | boolean> {
  return Object.fromEntries(definition.configurationFields.map((field) => {
    const value = installation?.configuration[field.id];
    return [field.id, field.kind === "boolean" ? value === true : typeof value === "string" ? value : ""];
  }));
}

export function configurationDisplayValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "string" && value.trim()) return value;
  return "Empty";
}

export function serializeConfiguration(
  fields: readonly OfferingConfigurationField[],
  values: Record<string, string | boolean>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.id];
    if (field.kind === "boolean") {
      result[field.id] = value === true;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (text || field.required) result[field.id] = text;
  }
  return result;
}
